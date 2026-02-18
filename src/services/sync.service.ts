/**
 * Sync orchestrator: Notion → Database.
 * Replaces the entire "Notion to Airtable Sync" n8n workflow.
 */

import type { PrismaClient } from "@prisma/client";
import { NotionService } from "./notion.service.js";
import { convertNotionBlocksToMarkdown } from "./notion-to-markdown.js";
import { ImagePipelineService } from "./image-pipeline.service.js";
import { WordPressService } from "./wordpress.service.js";
import { CredentialService } from "./credential.service.js";
import { logger } from "../lib/logger.js";

export class SyncService {
  constructor(private prisma: PrismaClient) {}

  /** Sync a single Notion page to the database. Returns the post's database ID. */
  async syncPost(tenantId: string, notionPageId: string): Promise<string> {
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

    // Extract last_edited_time for change detection on future re-syncs
    const pageObj = page as Record<string, unknown>;
    const notionLastEdit = pageObj.last_edited_time
      ? new Date(pageObj.last_edited_time as string)
      : undefined;

    // 3. Convert to markdown
    const result = convertNotionBlocksToMarkdown(
      blocks as Array<Record<string, unknown>>,
      pageObj.properties as Record<string, unknown>,
      notionPageId,
    );

    // 4. Resolve category
    const category = result.metadata.category
      ? await this.prisma.category.findUnique({
          where: { tenantId_name: { tenantId, name: result.metadata.category } },
        })
      : null;

    // Determine final status: re-syncing a published post → UPDATE_PENDING
    const existing = await this.prisma.post.findUnique({
      where: { tenantId_notionPageId: { tenantId, notionPageId } },
      select: { wpPostId: true },
    });
    const isUpdate = existing?.wpPostId != null;
    const finalStatus = isUpdate ? "UPDATE_PENDING" : "SYNCED";

    // 5. Process images if any
    let postId: string;
    if (result.images.length > 0) {
      const wpCreds = await credService.getWordPressCredentials(tenantId);
      if (!wpCreds) throw new Error("WordPress credentials not configured");

      const wp = new WordPressService(wpCreds);
      const pipeline = new ImagePipelineService(this.prisma, wp);

      // Upsert post first (need ID for image mapping) and mark as processing
      const post = await this.upsertPost(
        tenantId,
        notionPageId,
        result,
        category?.id,
        "IMAGES_PROCESSING",
        notionLastEdit,
      );
      postId = post.id;

      const imageResult = await pipeline.processImages(
        tenantId,
        post.id,
        result.images,
        result.markdown,
        result.metadata.slug || result.metadata.title,
      );

      // Update with processed content and final status
      await this.prisma.post.update({
        where: { id: post.id },
        data: {
          markdownContent: imageResult.processedContent,
          status: finalStatus,
          syncedAt: new Date(),
        },
      });

      await pipeline.cleanupOrphans(tenantId, post.id, imageResult.mappingIds);
    } else {
      const post = await this.upsertPost(
        tenantId,
        notionPageId,
        result,
        category?.id,
        finalStatus,
        notionLastEdit,
      );
      postId = post.id;
    }

    // 6. Update Notion status
    // New post → "Ready to Review" so the user can review the WP draft before publishing
    // Update → leave as "Processing"; publish service will set "Published" immediately after
    await notion.updatePageStatus(notionPageId, isUpdate ? "Processing" : "Ready to Review");

    logger.info({ tenantId, notionPageId, postId }, "Post synced successfully");
    return postId;
  }

  private async upsertPost(
    tenantId: string,
    notionPageId: string,
    result: ReturnType<typeof convertNotionBlocksToMarkdown>,
    categoryId?: string | null,
    status: "SYNCED" | "IMAGES_PROCESSING" | "UPDATE_PENDING" = "SYNCED",
    notionLastEdit?: Date,
  ) {
    const tags = result.metadata.tags ?? [];
    return this.prisma.post.upsert({
      where: { tenantId_notionPageId: { tenantId, notionPageId } },
      update: {
        title: result.metadata.title,
        slug: result.metadata.slug,
        markdownContent: result.markdown,
        seoKeyword: result.metadata.seoKeyword,
        featuredImageTitle: result.metadata.featuredImageTitle,
        categoryId: categoryId ?? undefined,
        tags,
        notionLastEdit,
        status,
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
        tags,
        notionLastEdit,
        status,
        syncedAt: new Date(),
      },
    });
  }
}
