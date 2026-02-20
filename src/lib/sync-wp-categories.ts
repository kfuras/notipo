import type { PrismaClient } from "@prisma/client";
import type { WordPressService } from "../services/wordpress.service.js";
import type { NotionService } from "../services/notion.service.js";
import { logger } from "./logger.js";

/**
 * Fetches all categories and tags from a tenant's WordPress site and upserts
 * them into the DB, linking name → WP ID.
 * Does NOT overwrite backgroundImage or wpTagIds on existing categories.
 */
export async function syncWpCategories(
  prisma: PrismaClient,
  tenantId: string,
  wp: WordPressService,
  notion?: NotionService,
  databaseId?: string,
): Promise<{ categories: number; tags: number }> {
  const [wpCategories, wpTags] = await Promise.all([
    wp.listCategories(),
    wp.listTags(),
  ]);

  for (const wpCat of wpCategories) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId, name: wpCat.name } },
      update: { wpCategoryId: wpCat.id },
      create: { name: wpCat.name, wpCategoryId: wpCat.id, tenantId, wpTagIds: [] },
    });
  }

  for (const wpTag of wpTags) {
    await prisma.tag.upsert({
      where: { tenantId_name: { tenantId, name: wpTag.name } },
      update: { wpTagId: wpTag.id },
      create: { name: wpTag.name, wpTagId: wpTag.id, tenantId },
    });
  }

  logger.debug({ tenantId, categories: wpCategories.length, tags: wpTags.length }, "Synced WP taxonomy");

  // Push category/tag names to Notion database as select options (if connected)
  if (notion && databaseId) {
    try {
      const categoryNames = wpCategories.map((c) => c.name);
      const tagNames = wpTags.map((t) => t.name);
      await notion.syncDatabaseOptions(databaseId, categoryNames, tagNames);
      logger.debug({ tenantId, databaseId }, "Synced taxonomy options to Notion database");
    } catch (e) {
      logger.warn({ err: e, tenantId }, "Failed to sync taxonomy options to Notion database");
    }
  }

  return { categories: wpCategories.length, tags: wpTags.length };
}
