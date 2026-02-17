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

    if (post.wpPostId) {
      // UPDATE existing post
      await wp.editPost(post.wpPostId, { content: wpContent, title: post.title });

      await this.prisma.post.update({
        where: { id: postId },
        data: { wpContent, status: "PUBLISHED", publishedAt: new Date() },
      });
    } else {
      // CREATE new post
      // Generate featured image
      let wpFeaturedMediaId: number | undefined;
      if (post.category?.backgroundImage && post.featuredImageTitle) {
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

      // Create WP draft
      const wpPost = await wp.createDraft({
        title: post.title,
        content: wpContent,
        status: "draft",
        slug: post.slug ?? undefined,
        categories: post.category?.wpCategoryId ? [post.category.wpCategoryId] : undefined,
        tags: post.category?.wpTagIds,
        featured_media: wpFeaturedMediaId,
      });

      // Set SEO meta
      if (post.seoKeyword) {
        const excerpt = wpPost.excerpt?.rendered || "";
        const cleanExcerpt = excerpt
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const description =
          cleanExcerpt.length > 160
            ? cleanExcerpt.slice(0, 159).trimEnd() + "..."
            : cleanExcerpt;

        await wp.updateRankMathSeo(wpPost.id, {
          rank_math_focus_keyword: post.seoKeyword,
          rank_math_title: "%title%",
          rank_math_description: description,
        });
      }

      // Publish
      await wp.publishPost(wpPost.id);

      // Update DB
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          wpPostId: wpPost.id,
          wpUrl: wpPost.link,
          wpContent,
          wpFeaturedMediaId,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    }

    // Update Notion status if we have credentials
    const notionCreds = await credService.getNotionCredentials(tenantId);
    if (notionCreds && post.notionPageId) {
      const notion = new NotionService(notionCreds.accessToken);
      await notion.updatePageStatus(post.notionPageId, "Published");
    }

    logger.info({ tenantId, postId, wpPostId: post.wpPostId }, "Post published");
  }
}
