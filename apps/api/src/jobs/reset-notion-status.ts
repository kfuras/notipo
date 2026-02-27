import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../services/notion.service.js";
import { CredentialService } from "../services/credential.service.js";
import { logger } from "../lib/logger.js";

/**
 * Find posts stuck in non-terminal status (SYNCED/IMAGES_PROCESSING/UPDATE_PENDING)
 * whose latest job FAILED, and reset their Notion status to "Sync Failed"
 * so the page isn't stuck on "Syncing" forever.
 */
export async function resetNotionStatusForFailedJobs(prisma: PrismaClient) {
  // Find FAILED sync jobs from the last hour that might have left Notion stuck
  const failedJobs = await prisma.job.findMany({
    where: {
      type: "SYNC_POST",
      status: "FAILED",
      startedAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { tenantId: true, payload: true },
  });

  const credService = new CredentialService(prisma);

  for (const job of failedJobs) {
    const payload = job.payload as { notionPageId?: string } | null;
    if (!payload?.notionPageId) continue;

    try {
      const creds = await credService.getNotionCredentials(job.tenantId);
      if (!creds) continue;

      const notion = new NotionService(creds.accessToken);
      // Only reset if page is still stuck on "Syncing"
      const page = await notion.getPageProperties(payload.notionPageId);
      const props = (page as Record<string, unknown>).properties as Record<string, unknown>;
      const statusProp = props?.Status as { select?: { name?: string } } | undefined;
      if (statusProp?.select?.name === "Syncing") {
        await notion.updatePageStatus(payload.notionPageId, "Sync Failed");
        logger.info({ tenantId: job.tenantId, notionPageId: payload.notionPageId }, "Reset Notion status from Syncing to Sync Failed");
      }
    } catch (err) {
      logger.warn({ tenantId: job.tenantId, err }, "Failed to reset Notion status for failed job");
    }
  }
}
