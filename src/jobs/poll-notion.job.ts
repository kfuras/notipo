import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../services/notion.service.js";
import { CredentialService } from "../services/credential.service.js";
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
        const credService = new CredentialService(prisma);
        const creds = await credService.getNotionCredentials(tenant.id);
        if (!creds || !tenant.notionDatabaseId) continue;

        const notion = new NotionService(creds.accessToken);

        // ── 1. "Post to Wordpress" → sync only (creates WP draft, waits for Publish) ──
        const syncPages = await notion.getReadyPosts(
          tenant.notionDatabaseId,
          tenant.notionTriggerStatus,
          5,
        );
        for (const page of syncPages) {
          const pageId = (page as { id: string }).id;
          log.info({ tenantId: tenant.id, pageId }, "Found post to sync, enqueuing sync-post");
          await boss.send(
            "sync-post",
            { tenantId: tenant.id, notionPageId: pageId },
            { singletonKey: `sync:${pageId}` },
          );
        }

        // ── 2. "Publish" → publish the existing draft live ──
        const publishPages = await notion.getReadyPosts(
          tenant.notionDatabaseId,
          tenant.notionPublishTriggerStatus,
          5,
        );
        for (const page of publishPages) {
          const pageId = (page as { id: string }).id;

          const post = await prisma.post.findUnique({
            where: { tenantId_notionPageId: { tenantId: tenant.id, notionPageId: pageId } },
            select: { id: true },
          });

          if (!post) {
            log.warn({ tenantId: tenant.id, pageId }, "Publish triggered but post not in DB — run sync first");
            continue;
          }

          log.info({ tenantId: tenant.id, pageId, postId: post.id }, "Found post to publish, enqueuing publish-post");
          await boss.send(
            "publish-post",
            { tenantId: tenant.id, postId: post.id },
            { singletonKey: `publish:${post.id}` },
          );
        }

        // ── 3. "Update Wordpress" → re-sync content then auto-publish ──
        const updatePages = await notion.getReadyPosts(
          tenant.notionDatabaseId,
          tenant.notionUpdateTriggerStatus,
          5,
        );
        for (const page of updatePages) {
          const pageId = (page as { id: string }).id;
          log.info({ tenantId: tenant.id, pageId }, "Found post to update, enqueuing sync-post (with publish)");
          await boss.send(
            "sync-post",
            { tenantId: tenant.id, notionPageId: pageId, thenPublish: true },
            { singletonKey: `sync:${pageId}` },
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error({ tenantId: tenant.id, error: message }, "Notion poll failed for tenant");
      }
    }
  });

  // Poll every 15 seconds using setInterval (pg-boss cron minimum is 1 minute)
  const POLL_INTERVAL_MS = 15_000;
  setInterval(() => {
    boss.send("poll-notion", {}, { singletonKey: "poll-notion" }).catch((err: unknown) => {
      logger.error({ err }, "Failed to enqueue poll-notion job");
    });
  }, POLL_INTERVAL_MS);

  // Kick off an immediate first poll on startup
  await boss.send("poll-notion", {}, { singletonKey: "poll-notion" });

  logger.info(`Notion polling scheduled every ${POLL_INTERVAL_MS / 1000}s`);
}
