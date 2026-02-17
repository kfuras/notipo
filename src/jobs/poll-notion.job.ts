import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../services/notion.service.js";
import { CredentialService } from "../services/credential.service.js";
import { logger } from "../lib/logger.js";

export async function registerPollNotionJob(boss: PgBoss, prisma: PrismaClient) {
  // Register the handler
  await boss.work("poll-notion", async () => {
    const log = logger.child({ job: "poll-notion" });

    // Get all tenants with Notion configured
    const tenants = await prisma.tenant.findMany({
      where: {
        notionCredentials: { not: null },
        notionDatabaseId: { not: null },
      },
    });

    for (const tenant of tenants) {
      try {
        const credService = new CredentialService(prisma);
        const creds = await credService.getNotionCredentials(tenant.id);
        if (!creds || !tenant.notionDatabaseId) continue;

        const notion = new NotionService(creds.accessToken);
        const pages = await notion.getReadyPosts(
          tenant.notionDatabaseId,
          tenant.notionTriggerStatus,
          5,
        );

        for (const page of pages) {
          const pageId = (page as { id: string }).id;
          log.info({ tenantId: tenant.id, pageId }, "Found ready post, enqueuing sync");

          await boss.send("sync-post", {
            tenantId: tenant.id,
            notionPageId: pageId,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error({ tenantId: tenant.id, error: message }, "Notion poll failed for tenant");
      }
    }
  });

  // Schedule to run every 60 seconds
  await boss.schedule("poll-notion", "* * * * *"); // every minute

  logger.info("Notion polling cron scheduled (every 60s)");
}
