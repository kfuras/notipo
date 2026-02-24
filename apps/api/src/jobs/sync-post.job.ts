import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import type { EventEmitter } from "events";
import { SyncService } from "../services/sync.service.js";
import { canSyncPost } from "../lib/plan-limits.js";
import { logger } from "../lib/logger.js";

interface SyncPostPayload {
  tenantId: string;
  notionPageId: string;
  thenPublish?: boolean;
}

export async function registerSyncPostJob(boss: PgBoss, prisma: PrismaClient, eventBus: EventEmitter) {
  await boss.createQueue("sync-post");
  await boss.work<SyncPostPayload>("sync-post", { batchSize: 1 }, async (jobs) => {
    const job = jobs[0];
    const { tenantId, notionPageId } = job.data;
    const { thenPublish } = job.data;
    const log = logger.child({ jobId: job.id, tenantId, notionPageId });

    log.info("Starting post sync");

    // Check plan limits — only for new posts (not re-syncs)
    const existingPost = await prisma.post.findUnique({
      where: { tenantId_notionPageId: { tenantId, notionPageId } },
      select: { id: true },
    });
    if (!existingPost) {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { plan: true, trialEndsAt: true },
      });
      const check = await canSyncPost(prisma, tenantId, tenant.plan, tenant.trialEndsAt);
      if (!check.allowed) {
        log.warn({ tenantId }, check.reason);
        throw new Error(check.reason);
      }
    }

    // Track in jobs table
    const dbJob = await prisma.job.create({
      data: {
        tenantId,
        type: "SYNC_POST",
        status: "RUNNING",
        payload: job.data as object,
        pgBossJobId: job.id,
        startedAt: new Date(),
      },
    });

    eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "SYNC_POST", status: "RUNNING", notionPageId });

    try {
      const syncService = new SyncService(prisma);
      const onStep = async (step: string) => {
        await prisma.job.update({ where: { id: dbJob.id }, data: { result: { step } } });
        eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "SYNC_POST", status: "RUNNING", notionPageId, step });
      };
      const { postId, wpStatus, wasPublished } = await syncService.syncPost(tenantId, notionPageId, onStep);

      // Build result summary from the synced post
      const post = await prisma.post.findFirst({
        where: { id: postId, tenantId },
        select: {
          wpPostId: true, wpUrl: true, status: true,
          category: { select: { name: true } },
          _count: { select: { imageMappings: true } },
        },
      });

      await prisma.job.update({
        where: { id: dbJob.id },
        data: {
          postId,
          status: "COMPLETED",
          completedAt: new Date(),
          result: {
            category: post?.category?.name ?? null,
            images: post?._count.imageMappings ?? 0,
            wpPostId: post?.wpPostId ?? null,
            wpUrl: post?.wpUrl ?? null,
            postStatus: post?.status ?? null,
          },
        },
      });

      eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "SYNC_POST", status: "COMPLETED", postId });

      if (thenPublish) {
        // Auto-publish if the WP post is live OR was previously published in our DB
        // (a prior sync may have accidentally reverted the WP status to draft).
        if (wpStatus === "publish" || wasPublished) {
          await boss.send("publish-post", { tenantId, postId }, { singletonKey: `publish:${postId}` });
          log.info({ postId, wpStatus, wasPublished }, "Post sync completed, publish enqueued");
        } else {
          // Draft re-sync: revert status from UPDATE_PENDING back to SYNCED
          await prisma.post.update({ where: { id: postId }, data: { status: "SYNCED" } });
          log.info({ postId, wpStatus }, "Post sync completed, skipping auto-publish (WP post is not live)");
        }
      } else {
        log.info({ postId }, "Post sync completed, awaiting Publish trigger");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ error: message }, "Post sync failed");

      await prisma.job.update({
        where: { id: dbJob.id },
        data: { status: "FAILED", error: message },
      });

      eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "SYNC_POST", status: "FAILED" });

      // Mark post as FAILED if it exists
      await prisma.post
        .update({
          where: { tenantId_notionPageId: { tenantId, notionPageId } },
          data: { status: "FAILED" },
        })
        .catch(() => undefined); // post may not exist yet if failure was early

      throw error; // pg-boss will retry
    }
  });
}
