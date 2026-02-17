import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { SyncService } from "../services/sync.service.js";
import { logger } from "../lib/logger.js";

interface SyncPostPayload {
  tenantId: string;
  notionPageId: string;
}

export async function registerSyncPostJob(boss: PgBoss, prisma: PrismaClient) {
  await boss.work<SyncPostPayload>("sync-post", { teamSize: 2, teamConcurrency: 1 }, async (job) => {
    const { tenantId, notionPageId } = job.data;
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
      await syncService.syncPost(tenantId, notionPageId);

      await prisma.job.update({
        where: { id: dbJob.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      log.info("Post sync completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error({ error: message }, "Post sync failed");

      await prisma.job.update({
        where: { id: dbJob.id },
        data: { status: "FAILED", error: message },
      });

      throw error; // pg-boss will retry
    }
  });
}
