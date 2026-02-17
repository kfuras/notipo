/**
 * Sync orchestrator: Notion → Database.
 * Replaces the entire "Notion to Airtable Sync" n8n workflow.
 */

import type { PrismaClient } from "@prisma/client";
import { NotionService } from "./notion.service.js";
import { convertNotionBlocksToMarkdown } from "./notion-to-markdown.js";
import { extractImages, ImagePipelineService } from "./image-pipeline.service.js";
import { WordPressService } from "./wordpress.service.js";
import { CredentialService } from "./credential.service.js";
import { logger } from "../lib/logger.js";

export class SyncService {
  constructor(private prisma: PrismaClient) {}

  /** Sync a single Notion page to the database. */
  async syncPost(tenantId: string, notionPageId: string) {
    const credService = new CredentialService(this.prisma);

    // Get tenant credentials
    const notionCreds = await credService.getNotionCredentials(tenantId);
    if (!notionCreds) throw new Error("Notion credentials not configured");

    const notion = new NotionService(notionCreds.accessToken);

    // 1. Set Notion status to "Processing"
    await notion.updatePageStatus(notionPageId, "Processing");
    logger.info({ tenantId, notionPageId }, "Syncing post from Notion");

    // 2. Get page properties and blocks
    const page = await notion.getPageProperties(notionPageId);
    const blocks = await notion.getPageBlocks(notionPageId);

    // 3. Convert to markdown
    const result = convertNotionBlocksToMarkdown(
      blocks as Array<Record<string, unknown>>,
      (page as Record<string, unknown>).properties as Record<string, unknown>,
      notionPageId,
    );

    // 4. Resolve category
    const category = result.metadata.category
      ? await this.prisma.category.findUnique({
          where: { tenantId_name: { tenantId, name: result.metadata.category } },
        })
      : null;

    // 5. Process images if any
    let processedContent = result.markdown;
    let mappingIds: string[] = [];

    if (result.images.length > 0) {
      const wpCreds = await credService.getWordPressCredentials(tenantId);
      if (!wpCreds) throw new Error("WordPress credentials not configured");

      const wp = new WordPressService(wpCreds);
      const pipeline = new ImagePipelineService(this.prisma, wp);

      // Upsert post first to get an ID for image mapping references
      const post = await this.upsertPost(tenantId, notionPageId, result, category?.id);

      const imageResult = await pipeline.processImages(
        tenantId,
        post.id,
        result.images,
        result.markdown,
        result.metadata.title,
      );

      processedContent = imageResult.processedContent;
      mappingIds = imageResult.mappingIds;

      // Update with processed content
      await this.prisma.post.update({
        where: { id: post.id },
        data: {
          markdownContent: processedContent,
          status: "SYNCED",
          syncedAt: new Date(),
        },
      });

      // Cleanup orphaned mappings
      await pipeline.cleanupOrphans(tenantId, post.id, mappingIds);
    } else {
      // No images - just upsert
      await this.upsertPost(tenantId, notionPageId, result, category?.id);
    }

    // 6. Update Notion status
    await notion.updatePageStatus(notionPageId, "Synced to Airtable");

    logger.info({ tenantId, notionPageId }, "Post synced successfully");
  }

  private async upsertPost(
    tenantId: string,
    notionPageId: string,
    result: ReturnType<typeof convertNotionBlocksToMarkdown>,
    categoryId?: string | null,
  ) {
    return this.prisma.post.upsert({
      where: { tenantId_notionPageId: { tenantId, notionPageId } },
      update: {
        title: result.metadata.title,
        slug: result.metadata.slug,
        markdownContent: result.markdown,
        seoKeyword: result.metadata.seoKeyword,
        featuredImageTitle: result.metadata.featuredImageTitle,
        categoryId: categoryId ?? undefined,
        status: "SYNCED",
        syncedAt: new Date(),
      },
      create: {
        tenantId,
        notionPageId,
        title: result.metadata.title,
        slug: result.metadata.slug,
        markdownContent: result.markdown,
        seoKeyword: result.metadata.seoKeyword,
        featuredImageTitle: result.metadata.featuredImageTitle,
        categoryId: categoryId ?? undefined,
        status: "SYNCED",
        syncedAt: new Date(),
      },
    });
  }
}
