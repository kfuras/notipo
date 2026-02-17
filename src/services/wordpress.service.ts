/**
 * WordPress REST API client.
 * Ported from n8n workflow Y6O8LzWsujHZz3G5 HTTP Request nodes.
 * Uses Basic Auth with application passwords.
 */

import axios, { type AxiosInstance } from "axios";
import type { WPPostPayload, WPMediaUpload, RankMathSeoPayload } from "../types/index.js";

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
    const { data } = await this.client.post("/posts", {
      ...payload,
      status: "draft",
    });
    return data;
  }

  /** Edit an existing post's content. */
  async editPost(wpPostId: number, payload: Partial<WPPostPayload>) {
    const { data } = await this.client.post(`/posts/${wpPostId}`, payload);
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

  /** Update Rank Math SEO meta fields on a post. */
  async updateRankMathSeo(wpPostId: number, seo: RankMathSeoPayload) {
    const { data } = await this.client.post(`/posts/${wpPostId}`, {
      meta: seo,
    });
    return data;
  }
}
