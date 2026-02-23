/**
 * WordPress REST API client.
 * Ported from n8n workflow Y6O8LzWsujHZz3G5 HTTP Request nodes.
 * Uses Basic Auth with application passwords.
 */

import axios, { type AxiosInstance } from "axios";
import type { WPPostPayload, WPMediaUpload, RankMathSeoPayload } from "../types/index.js";
import { logger } from "../lib/logger.js";

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export class WordPressService {
  private client: AxiosInstance;

  constructor(credentials: WordPressCredentials) {
    const auth = Buffer.from(
      `${credentials.username}:${credentials.appPassword}`,
    ).toString("base64");

    this.client = axios.create({
      baseURL: `${credentials.siteUrl}/wp-json/wp/v2`,
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
  }

  /** Create a draft post. */
  async createDraft(payload: WPPostPayload) {
    const response = await this.client.post("/posts", {
      ...payload,
      status: "draft",
    });
    logger.info({ wpStatus: response.status, wpPostId: response.data?.id, wpPostStatus: response.data?.status, wpLink: response.data?.link }, "WP createDraft response");
    return response.data;
  }

  /** Edit an existing post's content. */
  async editPost(wpPostId: number, payload: Partial<WPPostPayload>) {
    const { data } = await this.client.post(`/posts/${wpPostId}`, payload);
    logger.info({ wpPostId, wpPostStatus: data?.status, wpLink: data?.link }, "WP editPost response");
    return data;
  }

  /** Publish a draft post. */
  async publishPost(wpPostId: number) {
    const { data } = await this.client.post(`/posts/${wpPostId}`, {
      status: "publish",
    });
    return data;
  }

  /** Get a post by ID. */
  async getPost(wpPostId: number) {
    const { data } = await this.client.get(`/posts/${wpPostId}`);
    return data;
  }

  /** Upload media to WordPress media library. */
  async uploadMedia(
    imageBuffer: Buffer,
    filename: string,
    mimeType = "image/png",
  ): Promise<WPMediaUpload> {
    const { data } = await this.client.post("/media", imageBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
    return data;
  }

  /** Update media metadata (alt, title, caption). */
  async updateMediaMeta(
    wpMediaId: number,
    meta: { alt_text?: string; title?: string; caption?: string },
  ) {
    const { data } = await this.client.post(`/media/${wpMediaId}`, meta);
    return data;
  }

  /** Attach a media item as the featured image of a post. */
  async attachFeaturedImage(wpPostId: number, wpMediaId: number) {
    const { data } = await this.client.post(`/posts/${wpPostId}`, {
      featured_media: wpMediaId,
    });
    return data;
  }

  /** Resolve tag slugs to WordPress tag IDs, creating missing tags. */
  async resolveTagIds(tagNames: string[]): Promise<number[]> {
    if (tagNames.length === 0) return [];
    const ids: number[] = [];
    for (const name of tagNames) {
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const { data: found } = await this.client.get<Array<{ id: number }>>("/tags", {
        params: { slug, per_page: 1 },
      });
      if (found.length > 0) {
        ids.push(found[0].id);
      } else {
        const { data: created } = await this.client.post<{ id: number }>("/tags", { name, slug });
        ids.push(created.id);
      }
    }
    return ids;
  }

  /** Permanently delete a media item from the WordPress media library. */
  async deleteMedia(wpMediaId: number) {
    await this.client.delete(`/media/${wpMediaId}`, { params: { force: true } });
  }

  /** Fetch all categories from the WordPress site. */
  async listCategories(): Promise<Array<{ id: number; name: string; slug: string; count: number }>> {
    const results: Array<{ id: number; name: string; slug: string; count: number }> = [];
    let page = 1;
    while (true) {
      const { data } = await this.client.get("/categories", {
        params: { per_page: 100, page },
      });
      for (const c of data) {
        results.push({ id: c.id, name: c.name, slug: c.slug, count: c.count });
      }
      if (data.length < 100) break;
      page++;
    }
    return results;
  }

  /** Fetch all tags from the WordPress site. */
  async listTags(): Promise<Array<{ id: number; name: string; slug: string; count: number }>> {
    const results: Array<{ id: number; name: string; slug: string; count: number }> = [];
    let page = 1;
    while (true) {
      const { data } = await this.client.get("/tags", {
        params: { per_page: 100, page },
      });
      for (const t of data) {
        results.push({ id: t.id, name: t.name, slug: t.slug, count: t.count });
      }
      if (data.length < 100) break;
      page++;
    }
    return results;
  }

  /** Update Rank Math SEO meta fields on a post. */
  async updateRankMathSeo(wpPostId: number, seo: RankMathSeoPayload) {
    const { data } = await this.client.post(`/posts/${wpPostId}`, {
      meta: seo,
    });
    return data;
  }
}
