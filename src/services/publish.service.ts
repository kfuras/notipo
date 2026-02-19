/**
 * Publish orchestrator: Database → WordPress.
 * Replaces the "Publish to Wordpress" n8n workflow.
 */

import type { PrismaClient } from "@prisma/client";
import { WordPressService } from "./wordpress.service.js";
import { FeaturedImageService } from "./featured-image.service.js";
import { CredentialService } from "./credential.service.js";
import { NotionService } from "./notion.service.js";
import { convertMarkdownToGutenberg } from "./markdown-to-gutenberg.js";
import { logger } from "../lib/logger.js";

export class PublishService {
  constructor(private prisma: PrismaClient) {}

  /** Publish a post from the database to WordPress. */
  async publishPost(tenantId: string, postId: string, onStep?: (step: string) => void) {
    const credService = new CredentialService(this.prisma);

    // Load post with relations
    const post = await this.prisma.post.findFirst({
      where: { id: postId, tenantId },
      include: { category: true, tenant: true },
    });
    if (!post) throw new Error("Post not found");
    if (!post.markdownContent) throw new Error("Post has no content");

    // Get credentials
    const wpCreds = await credService.getWordPressCredentials(tenantId);
    if (!wpCreds) throw new Error("WordPress credentials not configured");

    const wp = new WordPressService(wpCreds);

    // Update status
    await this.prisma.post.update({
      where: { id: postId },
      data: { status: "PUBLISHING" },
    });

    logger.info({ tenantId, postId }, "Publishing post to WordPress");

    // 1. Convert markdown to Gutenberg blocks
    onStep?.("Converting to Gutenberg…");
    const wpContent = convertMarkdownToGutenberg(post.markdownContent, {
      highlighter: post.tenant.codeHighlighter,
    });

    // 2. Generate featured image if not yet uploaded for this post
    let wpFeaturedMediaId: number | undefined = post.wpFeaturedMediaId ?? undefined;
    if (!wpFeaturedMediaId && post.category?.backgroundImage && post.featuredImageTitle) {
      onStep?.("Generating featured image…");
      const imgService = new FeaturedImageService();
      const imageBuffer = await imgService.generate({
        title: post.featuredImageTitle,
        category: post.category.name,
        backgroundImageUrl: post.category.backgroundImage,
      });
      const slug = post.slug || post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const media = await wp.uploadMedia(imageBuffer, `${slug}-featured.png`);
      await wp.updateMediaMeta(media.id, {
        alt_text: post.featuredImageTitle,
        title: post.featuredImageTitle,
      });
      wpFeaturedMediaId = media.id;
    }

    // Resolve tags: post-level tags from Notion take priority, fall back to category defaults
    const tagIds =
      post.tags.length > 0
        ? await wp.resolveTagIds(post.tags)
        : (post.category?.wpTagIds ?? []);

    if (post.wpPostId) {
      // UPDATE existing WordPress post (draft being published for the first time, or re-publish)
      onStep?.("Updating WP post…");
      await wp.editPost(post.wpPostId, {
        title: post.title,
        content: wpContent,
        ...(wpFeaturedMediaId && { featured_media: wpFeaturedMediaId }),
        ...(post.category?.wpCategoryId && { categories: [post.category.wpCategoryId] }),
        ...(tagIds.length && { tags: tagIds }),
      });

      // Publish (makes live if draft, refreshes if already live)
      // Do this before SEO so the excerpt is fully generated from the published content
      onStep?.("Publishing…");
      const published = await wp.publishPost(post.wpPostId);

      // Apply Rank Math SEO meta (requires "SEO Keyword" to be set in Notion)
      onStep?.("Setting SEO metadata…");
      let seoDescription = post.seoDescription;
      if (post.seoKeyword) {
        if (!seoDescription) {
          // Derive description from WP-generated excerpt on first publish
          const excerpt = published.excerpt?.rendered || "";
          const clean = excerpt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          if (clean) {
            seoDescription = clean.length > 160 ? clean.slice(0, 159).trimEnd() + "..." : clean;
          }
        }
        await wp.updateRankMathSeo(post.wpPostId, {
          rank_math_focus_keyword: post.seoKeyword,
          rank_math_title: "%title%",
          rank_math_description: seoDescription ?? "",
        });
        logger.info({ wpPostId: post.wpPostId, seoKeyword: post.seoKeyword }, "Rank Math SEO meta applied");
      } else {
        logger.warn({ postId }, "seoKeyword not set — skipping Rank Math SEO (set 'SEO Keyword' in Notion)");
      }

      await this.prisma.post.update({
        where: { id: postId },
        data: {
          wpContent,
          wpUrl: published.link ?? post.wpUrl,
          wpFeaturedMediaId: wpFeaturedMediaId ?? undefined,
          seoDescription: seoDescription ?? undefined,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    } else {
      // CREATE new WordPress post as draft
      onStep?.("Creating WP draft…");
      const wpPost = await wp.createDraft({
        title: post.title,
        content: wpContent,
        status: "draft",
        slug: post.slug ?? undefined,
        categories: post.category?.wpCategoryId ? [post.category.wpCategoryId] : undefined,
        tags: tagIds.length ? tagIds : undefined,
        featured_media: wpFeaturedMediaId,
      });

      // Publish — use the returned link as it reflects the final permalink
      // Do this before SEO so the excerpt is fully generated from the published content
      onStep?.("Publishing…");
      const published = await wp.publishPost(wpPost.id);

      // Apply Rank Math SEO meta (requires "SEO Keyword" to be set in Notion)
      onStep?.("Setting SEO metadata…");
      let seoDescription: string | undefined;
      if (post.seoKeyword) {
        const excerpt = published.excerpt?.rendered || "";
        const clean = excerpt
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (clean) {
          seoDescription = clean.length > 160 ? clean.slice(0, 159).trimEnd() + "..." : clean;
        }
        await wp.updateRankMathSeo(wpPost.id, {
          rank_math_focus_keyword: post.seoKeyword,
          rank_math_title: "%title%",
          rank_math_description: seoDescription ?? "",
        });
        logger.info({ wpPostId: wpPost.id, seoKeyword: post.seoKeyword }, "Rank Math SEO meta applied");
      } else {
        logger.warn({ postId }, "seoKeyword not set — skipping Rank Math SEO (set 'SEO Keyword' in Notion)");
      }

      // Persist wpPostId, wpUrl, featured image ID, and seoDescription for future edits
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          wpPostId: wpPost.id,
          wpUrl: published.link ?? wpPost.link,
          wpContent,
          wpFeaturedMediaId: wpFeaturedMediaId ?? undefined,
          seoDescription: seoDescription ?? undefined,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    }

    // Update Notion status
    onStep?.("Updating Notion status…");
    const notionCreds = await credService.getNotionCredentials(tenantId);
    if (notionCreds && post.notionPageId) {
      const notion = new NotionService(notionCreds.accessToken);
      await notion.updatePageStatus(post.notionPageId, "Published");
    }

    logger.info({ tenantId, postId, wpPostId: post.wpPostId }, "Post published");
  }
}
