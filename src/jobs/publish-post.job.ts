import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { PublishService } from "../services/publish.service.js";
import { logger } from "../lib/logger.js";

interface PublishPostPayload {
  tenantId: string;
  postId: string;
}

export async function registerPublishPostJob(boss: PgBoss, prisma: PrismaClient) {
  await boss.work<PublishPostPayload>("publish-post", { teamSize: 2, teamConcurrency: 1 }, async (job) => {
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

    try {
      const publishService = new PublishService(prisma);
      await publishService.publishPost(tenantId, postId);

      await prisma.job.update({
        where: { id: dbJob.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      log.info("Post publish completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ error: message }, "Post publish failed");

      await prisma.job.update({
        where: { id: dbJob.id },
        data: { status: "FAILED", error: message },
      });

      throw error;
    }
  });
}
