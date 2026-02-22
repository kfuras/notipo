/**
 * Sync orchestrator: Notion → Database → WordPress draft.
 * Replaces the entire "Notion to Airtable Sync" n8n workflow.
 */

import type { PrismaClient } from "@prisma/client";
import { NotionService } from "./notion.service.js";
import { convertNotionBlocksToMarkdown } from "./notion-to-markdown.js";
import { ImagePipelineService } from "./image-pipeline.service.js";
import { WordPressService } from "./wordpress.service.js";
import { CredentialService } from "./credential.service.js";
import { convertMarkdownToGutenberg } from "./markdown-to-gutenberg.js";
import { FeaturedImageService } from "./featured-image.service.js";
import { logger } from "../lib/logger.js";

export class SyncService {
  constructor(private prisma: PrismaClient) {}

  /** Sync a single Notion page to the database. Returns the post ID and WP status. */
  async syncPost(tenantId: string, notionPageId: string, onStep?: (step: string) => void): Promise<{ postId: string; wpStatus: string | null }> {
    const credService = new CredentialService(this.prisma);

    // Get tenant credentials
    const notionCreds = await credService.getNotionCredentials(tenantId);
    if (!notionCreds) throw new Error("Notion credentials not configured");

    const wpCreds = await credService.getWordPressCredentials(tenantId);
    if (!wpCreds) throw new Error("WordPress credentials not configured");

    const notion = new NotionService(notionCreds.accessToken);
    const wp = new WordPressService(wpCreds);

    logger.info({ tenantId, notionPageId }, "Syncing post from Notion");

    // 1. Get page properties and blocks
    onStep?.("Fetching from Notion…");
    const page = await notion.getPageProperties(notionPageId);
    const blocks = await notion.getPageBlocks(notionPageId);

    // Extract last_edited_time for change detection on future re-syncs
    const pageObj = page as Record<string, unknown>;
    const notionLastEdit = pageObj.last_edited_time
      ? new Date(pageObj.last_edited_time as string)
      : undefined;

    // 2. Convert to markdown
    onStep?.("Converting to markdown…");
    const result = convertNotionBlocksToMarkdown(
      blocks as Array<Record<string, unknown>>,
      pageObj.properties as Record<string, unknown>,
      notionPageId,
    );

    // 3. Resolve category
    const category = result.metadata.category
      ? await this.prisma.category.findUnique({
          where: { tenantId_name: { tenantId, name: result.metadata.category } },
        })
      : null;

    logger.info({ title: result.metadata.title, category: result.metadata.category, imageCount: result.images.length }, "Notion content parsed");

    // Determine final status: re-syncing a published post → UPDATE_PENDING
    const existing = await this.prisma.post.findUnique({
      where: { tenantId_notionPageId: { tenantId, notionPageId } },
      select: { wpPostId: true },
    });
    const isUpdate = existing?.wpPostId != null;
    const finalStatus = isUpdate ? "UPDATE_PENDING" : "SYNCED";

    // 4. Process images if any
    let postId: string;
    let finalMarkdown = result.markdown;

    if (result.images.length > 0) {
      onStep?.(`Processing ${result.images.length} image${result.images.length === 1 ? "" : "s"}…`);
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

      finalMarkdown = imageResult.processedContent;

      // Update with processed content and final status
      await this.prisma.post.update({
        where: { id: post.id },
        data: {
          markdownContent: finalMarkdown,
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

    // 5. Create or update WordPress draft
    onStep?.(isUpdate ? "Updating WP post…" : "Creating WP draft…");
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { codeHighlighter: true },
    });
    const highlighter = tenant!.codeHighlighter;

    // Determine whether to update the existing WP post or create a new draft.
    // If the existing WP post was deleted, fall back to creating a new draft and
    // re-upload any images whose WP media was also deleted.
    let needsNewDraft = !isUpdate;
    let wpStatus: string | null = null;
    let wpUrl: string | undefined;
    if (isUpdate) {
      const wpContent = convertMarkdownToGutenberg(finalMarkdown, { highlighter });
      let wpPostGone = false;
      try {
        const updated = await wp.editPost(existing!.wpPostId!, { title: result.metadata.title, content: wpContent });
        wpStatus = updated.status ?? null;
        wpUrl = updated.link ?? undefined;
        // WP returns 200 even for trashed posts — treat trash the same as deleted
        if (updated.status === "trash") {
          logger.warn({ wpPostId: existing!.wpPostId }, "WP post is trashed, re-creating draft");
          wpPostGone = true;
        }
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 404) {
          logger.warn({ wpPostId: existing!.wpPostId }, "WP post not found (deleted?), re-creating draft");
          wpPostGone = true;
        } else {
          throw err;
        }
      }

      if (wpPostGone) {
        needsNewDraft = true;
        // Clear stale wpPostId/featured media so the new draft ID gets stored cleanly
        await this.prisma.post.update({
          where: { id: postId },
          data: { wpPostId: null, wpFeaturedMediaId: null },
        });
        // Clear stale image mappings so processImages re-uploads fresh copies
        if (result.images.length > 0) {
          await this.prisma.imageMapping.deleteMany({ where: { tenantId, postId } });
          const pipeline = new ImagePipelineService(this.prisma, wp);
          const imgSlug = result.metadata.slug || result.metadata.title;
          const reimageResult = await pipeline.processImages(
            tenantId, postId, result.images, result.markdown, imgSlug,
          );
          finalMarkdown = reimageResult.processedContent;
          await this.prisma.post.update({
            where: { id: postId },
            data: { markdownContent: finalMarkdown },
          });
        }
      }
    }

    if (needsNewDraft) {
      // Re-convert markdown → Gutenberg using the (possibly refreshed) finalMarkdown
      const wpContent = convertMarkdownToGutenberg(finalMarkdown, { highlighter });

      // Resolve tag IDs (post tags take priority over category defaults)
      const tagNames = result.metadata.tags ?? [];
      const tagIds = tagNames.length > 0
        ? await wp.resolveTagIds(tagNames)
        : (category?.wpTagIds ?? []);

      // Generate featured image
      let wpFeaturedMediaId: number | undefined;
      if (!category) {
        logger.warn({ notionCategory: result.metadata.category }, "Category not found in DB — skipping featured image");
      } else if (!category.backgroundImage) {
        logger.warn({ categoryName: category.name }, "Category has no backgroundImage — skipping featured image");
      } else if (!result.metadata.featuredImageTitle) {
        logger.warn("featuredImageTitle is empty — skipping featured image");
      }
      if (category?.backgroundImage && result.metadata.featuredImageTitle) {
        onStep?.("Generating featured image…");
        const imgService = new FeaturedImageService();
        const slug = result.metadata.slug || result.metadata.title;
        const safeSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 60);
        const imageBuffer = await imgService.generate({
          title: result.metadata.featuredImageTitle,
          category: category.name,
          backgroundImageUrl: category.backgroundImage,
        });
        const media = await wp.uploadMedia(imageBuffer, `${safeSlug}-featured.png`);
        await wp.updateMediaMeta(media.id, {
          alt_text: result.metadata.featuredImageTitle,
          title: result.metadata.featuredImageTitle,
        });
        wpFeaturedMediaId = media.id;
        logger.info({ wpFeaturedMediaId }, "Featured image uploaded to WP");
      }

      // Create a new WP draft for review
      const wpPost = await wp.createDraft({
        title: result.metadata.title,
        content: wpContent,
        status: "draft",
        slug: result.metadata.slug ?? undefined,
        categories: category?.wpCategoryId ? [category.wpCategoryId] : undefined,
        tags: tagIds.length ? tagIds : undefined,
        featured_media: wpFeaturedMediaId,
      });
      wpUrl = wpPost.link ?? undefined;
      logger.info({ wpPostId: wpPost.id, wpPostStatus: wpPost.status, wpPostLink: wpPost.link }, "WP draft created");
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          wpPostId: wpPost.id,
          wpFeaturedMediaId: wpFeaturedMediaId ?? null,
          wpContent,
        },
      });
    }

    // 6. Update Notion status.
    // For updates to live WP posts, skip — the publish job will set "Published" + live URL.
    // Only set "Ready to Review" for new drafts or updates to non-live posts.
    if (!(isUpdate && wpStatus === "publish")) {
      onStep?.("Updating Notion status…");
      await notion.updatePageStatus(notionPageId, "Ready to Review", wpUrl);
    }

    logger.info({ tenantId, notionPageId, postId }, "Post synced successfully");
    return { postId, wpStatus };
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
