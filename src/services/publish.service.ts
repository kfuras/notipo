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
  async publishPost(tenantId: string, postId: string) {
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
    const wpContent = convertMarkdownToGutenberg(post.markdownContent, {
      highlighter: post.tenant.codeHighlighter,
    });

    // 2. Generate featured image if not yet uploaded for this post
    let wpFeaturedMediaId: number | undefined = post.wpFeaturedMediaId ?? undefined;
    if (!wpFeaturedMediaId && post.category?.backgroundImage && post.featuredImageTitle) {
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
      // UPDATE existing WordPress post
      await wp.editPost(post.wpPostId, {
        title: post.title,
        content: wpContent,
        ...(wpFeaturedMediaId && { featured_media: wpFeaturedMediaId }),
        ...(post.category?.wpCategoryId && { categories: [post.category.wpCategoryId] }),
        ...(tagIds.length && { tags: tagIds }),
      });

      // Refresh SEO if we have a stored description from the initial publish
      if (post.seoKeyword && post.seoDescription) {
        await wp.updateRankMathSeo(post.wpPostId, {
          rank_math_focus_keyword: post.seoKeyword,
          rank_math_title: "%title%",
          rank_math_description: post.seoDescription,
        });
      }

      await this.prisma.post.update({
        where: { id: postId },
        data: {
          wpContent,
          wpFeaturedMediaId: wpFeaturedMediaId ?? undefined,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    } else {
      // CREATE new WordPress post as draft
      const wpPost = await wp.createDraft({
        title: post.title,
        content: wpContent,
        status: "draft",
        slug: post.slug ?? undefined,
        categories: post.category?.wpCategoryId ? [post.category.wpCategoryId] : undefined,
        tags: tagIds.length ? tagIds : undefined,
        featured_media: wpFeaturedMediaId,
      });

      // Set SEO meta using WP-generated excerpt as description
      let seoDescription: string | undefined;
      if (post.seoKeyword) {
        const excerpt = wpPost.excerpt?.rendered || "";
        const clean = excerpt
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const description = clean.length > 160 ? clean.slice(0, 159).trimEnd() + "..." : clean;
        seoDescription = description;

        await wp.updateRankMathSeo(wpPost.id, {
          rank_math_focus_keyword: post.seoKeyword,
          rank_math_title: "%title%",
          rank_math_description: description,
        });
      }

      // Publish — use the returned link as it reflects the final permalink
      const published = await wp.publishPost(wpPost.id);

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
    const notionCreds = await credService.getNotionCredentials(tenantId);
    if (notionCreds && post.notionPageId) {
      const notion = new NotionService(notionCreds.accessToken);
      await notion.updatePageStatus(post.notionPageId, "Published");
    }

    logger.info({ tenantId, postId, wpPostId: post.wpPostId }, "Post published");
  }
}
