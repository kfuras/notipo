import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { NotionService } from "../services/notion.service.js";
import { CredentialService } from "../services/credential.service.js";
import { WordPressService } from "../services/wordpress.service.js";
import { syncWpCategories } from "../lib/sync-wp-categories.js";
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

        // Auto-sync WP categories so new ones are picked up (and push to Notion)
        const wpCreds = await credService.getWordPressCredentials(tenant.id);
        if (wpCreds) {
          try {
            const wp = new WordPressService(wpCreds);
            await syncWpCategories(prisma, tenant.id, wp, notion, tenant.notionDatabaseId ?? undefined);
          } catch (e) {
            log.warn({ tenantId: tenant.id, err: e }, "Failed to sync WP categories");
          }
        }

        // ── 1. "Post to Wordpress" → sync only (creates WP draft, waits for Publish) ──
        const syncPages = await notion.getReadyPosts(
          tenant.notionDatabaseId,
          tenant.notionTriggerStatus,
          5,
        );
        for (const page of syncPages) {
          const pageId = (page as { id: string }).id;

          // Skip if the post already has a WP entry — "Post to Wordpress" is for new posts only
          const existingPost = await prisma.post.findUnique({
            where: { tenantId_notionPageId: { tenantId: tenant.id, notionPageId: pageId } },
            select: { wpPostId: true, status: true },
          });
          if (existingPost?.wpPostId) {
            log.warn({ tenantId: tenant.id, pageId, wpPostId: existingPost.wpPostId }, "Post already synced to WP — use 'Update Wordpress' instead, resetting Notion status");
            const resetStatus = existingPost.status === "PUBLISHED" ? "Published" : "Ready to Review";
            await notion.updatePageStatus(pageId, resetStatus);
            continue;
          }

          // Skip if there's already a running sync job for this page
          const runningJob = await prisma.job.findFirst({
            where: { tenantId: tenant.id, type: "SYNC_POST", status: "RUNNING", payload: { path: ["notionPageId"], equals: pageId } },
          });
          if (runningJob) {
            log.debug({ tenantId: tenant.id, pageId }, "Sync already running, skipping");
            continue;
          }

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

          const runningUpdateJob = await prisma.job.findFirst({
            where: { tenantId: tenant.id, type: "SYNC_POST", status: "RUNNING", payload: { path: ["notionPageId"], equals: pageId } },
          });
          if (runningUpdateJob) {
            log.debug({ tenantId: tenant.id, pageId }, "Sync already running, skipping update");
            continue;
          }

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

  // Poll every 5 minutes as a safety net (webhooks handle real-time delivery)
  const POLL_INTERVAL_MS = 300_000;
  setInterval(() => {
    boss.send("poll-notion", {}, { singletonKey: "poll-notion" }).catch((err: unknown) => {
      logger.error({ err }, "Failed to enqueue poll-notion job");
    });
  }, POLL_INTERVAL_MS);

  // Kick off an immediate first poll on startup
  await boss.send("poll-notion", {}, { singletonKey: "poll-notion" });

  logger.info(`Notion polling scheduled every ${POLL_INTERVAL_MS / 1000}s`);
}
