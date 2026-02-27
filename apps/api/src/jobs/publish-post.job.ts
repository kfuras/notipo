import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import type { EventEmitter } from "events";
import { PublishService } from "../services/publish.service.js";
import { NotionService } from "../services/notion.service.js";
import { CredentialService } from "../services/credential.service.js";
import { logger } from "../lib/logger.js";

interface PublishPostPayload {
  tenantId: string;
  postId: string;
}

export async function registerPublishPostJob(boss: PgBoss, prisma: PrismaClient, eventBus: EventEmitter) {
  await boss.createQueue("publish-post");
  await boss.work<PublishPostPayload>("publish-post", { batchSize: 1 }, async (jobs) => {
    const job = jobs[0];
    const { tenantId, postId } = job.data;
    const log = logger.child({ jobId: job.id, tenantId, postId });

    log.info("Starting post publish");

    const dbJob = await prisma.job.create({
      data: {
        tenantId,
        postId,
        type: "PUBLISH_POST",
        status: "RUNNING",
        payload: job.data as object,
        pgBossJobId: job.id,
        startedAt: new Date(),
      },
    });

    eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "PUBLISH_POST", status: "RUNNING", postId });

    try {
      const publishService = new PublishService(prisma);
      const onStep = async (step: string) => {
        await prisma.job.update({ where: { id: dbJob.id }, data: { result: { step } } });
        eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "PUBLISH_POST", status: "RUNNING", postId, step });
      };
      await publishService.publishPost(tenantId, postId, onStep);

      const post = await prisma.post.findFirst({
        where: { id: postId, tenantId },
        select: { wpPostId: true, wpUrl: true, status: true },
      });

      await prisma.job.update({
        where: { id: dbJob.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          result: {
            wpPostId: post?.wpPostId ?? null,
            wpUrl: post?.wpUrl ?? null,
            postStatus: post?.status ?? null,
          },
        },
      });

      eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "PUBLISH_POST", status: "COMPLETED", postId });

      log.info("Post publish completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ error: message }, "Post publish failed");

      await prisma.job.update({
        where: { id: dbJob.id },
        data: { status: "FAILED", error: message },
      });

      eventBus.emit("job:update", { tenantId, jobId: dbJob.id, type: "PUBLISH_POST", status: "FAILED", postId });

      await prisma.post
        .update({
          where: { id: postId, tenantId },
          data: { status: "FAILED" },
        })
        .catch(() => undefined);

      // Reset Notion status so the page isn't stuck on "Publishing"
      try {
        const post = await prisma.post.findFirst({
          where: { id: postId, tenantId },
          select: { notionPageId: true },
        });
        if (post?.notionPageId) {
          const credService = new CredentialService(prisma);
          const creds = await credService.getNotionCredentials(tenantId);
          if (creds) {
            const notion = new NotionService(creds.accessToken);
            await notion.updatePageStatus(post.notionPageId, "Publish Failed");
          }
        }
      } catch (notionErr) {
        log.warn({ error: notionErr }, "Failed to reset Notion status after publish failure");
      }

      throw error;
    }
  });
}
