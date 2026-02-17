/**
 * Client for the Python featured image generation sidecar.
 */

import axios from "axios";
import { config } from "../config.js";
import type { FeaturedImageRequest } from "../types/index.js";

export class FeaturedImageService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || config.IMAGE_SERVICE_URL;
  }

  /** Generate a featured image and return the PNG bytes. */
  async generate(params: FeaturedImageRequest): Promise<Buffer> {
    const response = await axios.post(`${this.baseUrl}/generate`, {
      title: params.title,
      category: params.category,
      background_url: params.backgroundImageUrl,
    }, {
      responseType: "arraybuffer",
      timeout: 30_000,
    });

    return Buffer.from(response.data);
  }

  /** Check if the image service is healthy. */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
