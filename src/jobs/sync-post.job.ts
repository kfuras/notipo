import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { SyncService } from "../services/sync.service.js";
import { logger } from "../lib/logger.js";

interface SyncPostPayload {
  tenantId: string;
  notionPageId: string;
  thenPublish?: boolean;
}

export async function registerSyncPostJob(boss: PgBoss, prisma: PrismaClient) {
  await boss.createQueue("sync-post");
  await boss.work<SyncPostPayload>("sync-post", { batchSize: 1 }, async (jobs) => {
    const job = jobs[0];
    const { tenantId, notionPageId } = job.data;
    const { thenPublish } = job.data;
    const log = logger.child({ jobId: job.id, tenantId, notionPageId });

    log.info("Starting post sync");

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

    try {
      const syncService = new SyncService(prisma);
      const postId = await syncService.syncPost(tenantId, notionPageId);

      // Build result summary from the synced post
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: {
          wpPostId: true, status: true,
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
            postStatus: post?.status ?? null,
          },
        },
      });

      if (thenPublish) {
        await boss.send("publish-post", { tenantId, postId }, { singletonKey: `publish:${postId}` });
        log.info({ postId }, "Post sync completed, publish enqueued");
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
