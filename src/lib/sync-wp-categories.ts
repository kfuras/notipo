import type { PrismaClient } from "@prisma/client";
import type { WordPressService } from "../services/wordpress.service.js";
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
  return { categories: wpCategories.length, tags: wpTags.length };
}
