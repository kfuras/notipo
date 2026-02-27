import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../services/notion.service.js";
import { CredentialService } from "../services/credential.service.js";
import { logger } from "../lib/logger.js";

const STUCK_STATUSES: Record<string, string> = {
  Syncing: "Sync Failed",
  Publishing: "Publish Failed",
};

/**
 * Find recently failed jobs and reset Notion pages stuck on
 * "Syncing" or "Publishing" to their respective failure status.
 */
export async function resetNotionStatusForFailedJobs(prisma: PrismaClient) {
  const failedJobs = await prisma.job.findMany({
    where: {
      type: { in: ["SYNC_POST", "PUBLISH_POST"] },
      status: "FAILED",
      startedAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { tenantId: true, type: true, postId: true, payload: true },
  });

  const credService = new CredentialService(prisma);

  for (const job of failedJobs) {
    // Get notionPageId from payload (sync jobs) or from the post (publish jobs)
    let notionPageId: string | undefined;
    const payload = job.payload as { notionPageId?: string } | null;
    if (payload?.notionPageId) {
      notionPageId = payload.notionPageId;
    } else if (job.postId) {
      const post = await prisma.post.findFirst({
        where: { id: job.postId, tenantId: job.tenantId },
        select: { notionPageId: true },
      });
      notionPageId = post?.notionPageId ?? undefined;
    }
    if (!notionPageId) continue;

    try {
      const creds = await credService.getNotionCredentials(job.tenantId);
      if (!creds) continue;

      const notion = new NotionService(creds.accessToken);
      const page = await notion.getPageProperties(notionPageId);
      const props = (page as Record<string, unknown>).properties as Record<string, unknown>;
      const statusProp = props?.Status as { select?: { name?: string } } | undefined;
      const currentStatus = statusProp?.select?.name;

      const failedStatus = currentStatus ? STUCK_STATUSES[currentStatus] : undefined;
      if (failedStatus) {
        await notion.updatePageStatus(notionPageId, failedStatus);
        logger.info({ tenantId: job.tenantId, notionPageId, from: currentStatus, to: failedStatus }, "Reset stuck Notion status");
      }
    } catch (err) {
      logger.warn({ tenantId: job.tenantId, err }, "Failed to reset Notion status for failed job");
    }
  }
}
