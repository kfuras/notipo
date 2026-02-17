/**
 * Image processing pipeline.
 * Ported from n8n workflow ojxkaTVjMVFmj9IA, F2 flow nodes.
 *
 * Extracts Notion S3 image URLs from markdown, checks PostgreSQL cache,
 * downloads new images, uploads to WordPress, stores mappings,
 * and replaces URLs in content.
 */

import type { PrismaClient } from "@prisma/client";
import type { WordPressService } from "./wordpress.service.js";
import type { ImageRef, ProcessedImages } from "../types/index.js";
import axios from "axios";

const NOTION_S3_PATTERNS = ["prod-files-secure.s3", "s3.us-west-2.amazonaws.com"];

/** Extract image references from markdown that point to Notion S3. */
export function extractImages(markdown: string): ImageRef[] {
  const regex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  const images: ImageRef[] = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const url = match[2];
    const isNotionS3 = NOTION_S3_PATTERNS.some((p) => url.includes(p));
    if (isNotionS3) {
      images.push({ alt: match[1], url, fullMatch: match[0] });
    }
  }

  return images;
}

/** Strip query parameters from a URL for cache lookup. */
function baseUrl(url: string): string {
  return url.split("?")[0];
}

/** Generate a SEO-friendly filename from title and index. */
function generateFilename(title: string, index: number, url: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .substring(0, 50);
  const ext = baseUrl(url).split(".").pop() || "png";
  return `${slug}-${String(index + 1).padStart(2, "0")}.${ext}`;
}

export class ImagePipelineService {
  constructor(
    private prisma: PrismaClient,
    private wp: WordPressService,
  ) {}

  /** Process all images in a post's markdown content. */
  async processImages(
    tenantId: string,
    postId: string,
    images: ImageRef[],
    originalContent: string,
    title: string,
  ): Promise<ProcessedImages> {
    const urlMap: Record<string, string> = {};
    const mappingIds: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const base = baseUrl(img.url);
      const filename = generateFilename(title, i, img.url);

      // Check cache
      const cached = await this.prisma.imageMapping.findUnique({
        where: { tenantId_notionImageUrl: { tenantId, notionImageUrl: base } },
      });

      if (cached) {
        urlMap[base] = cached.wpImageUrl;
        mappingIds.push(cached.id);
      } else {
        // Download from Notion
        const response = await axios.get(img.url, { responseType: "arraybuffer" });
        const buffer = Buffer.from(response.data);

        // Upload to WordPress
        const media = await this.wp.uploadMedia(buffer, filename);

        // Store mapping
        const mapping = await this.prisma.imageMapping.create({
          data: {
            tenantId,
            notionImageUrl: base,
            wpImageUrl: media.source_url,
            wpMediaId: media.id,
            filename,
            postId,
          },
        });

        urlMap[base] = media.source_url;
        mappingIds.push(mapping.id);
      }
    }

    // Replace all Notion URLs with WordPress URLs in content
    let processedContent = originalContent;
    for (const [notionUrl, wpUrl] of Object.entries(urlMap)) {
      const escapedBase = notionUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedBase + "(\\?[^)\\s]*)?", "g");
      processedContent = processedContent.replace(regex, wpUrl);
    }

    return { urlMap, mappingIds, processedContent };
  }

  /** Remove image mappings not in the current mapping list. */
  async cleanupOrphans(tenantId: string, postId: string, currentMappingIds: string[]) {
    await this.prisma.imageMapping.deleteMany({
      where: {
        tenantId,
        postId,
        id: { notIn: currentMappingIds },
      },
    });
  }
}
