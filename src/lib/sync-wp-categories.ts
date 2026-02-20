import type { PrismaClient } from "@prisma/client";
import type { WordPressService } from "../services/wordpress.service.js";
import { logger } from "./logger.js";

/**
 * Fetches all categories from a tenant's WordPress site and upserts them
 * into the Category table, linking name → wpCategoryId.
 * Does NOT overwrite backgroundImage or wpTagIds if the category already exists.
 */
export async function syncWpCategories(
  prisma: PrismaClient,
  tenantId: string,
  wp: WordPressService,
): Promise<number> {
  const wpCategories = await wp.listCategories();
  for (const wpCat of wpCategories) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId, name: wpCat.name } },
      update: { wpCategoryId: wpCat.id },
      create: { name: wpCat.name, wpCategoryId: wpCat.id, tenantId, wpTagIds: [] },
    });
  }
  logger.debug({ tenantId, count: wpCategories.length }, "Synced WP categories");
  return wpCategories.length;
}
