import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { pollTenant } from "../lib/poll-tenant.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export async function registerPollNotionJob(boss: PgBoss, prisma: PrismaClient) {
  await boss.createQueue("poll-notion");

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
        await pollTenant(boss, prisma, tenant);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error({ tenantId: tenant.id, error: message }, "Notion poll failed for tenant");
      }
    }
  });

  // Safety-net poll — primary detection is via Notion webhooks (delivered automatically for OAuth users)
  const POLL_INTERVAL_MS = config.POLL_INTERVAL_SECONDS * 1000;
  setInterval(() => {
    boss.send("poll-notion", {}, { singletonKey: "poll-notion" }).catch((err: unknown) => {
      logger.error({ err }, "Failed to enqueue poll-notion job");
    });
  }, POLL_INTERVAL_MS);

  // Kick off an immediate first poll on startup
  await boss.send("poll-notion", {}, { singletonKey: "poll-notion" });

  logger.info(`Notion polling scheduled every ${POLL_INTERVAL_MS / 1000}s`);
}
