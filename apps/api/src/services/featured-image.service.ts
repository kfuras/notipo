/**
 * Featured image generator — in-process Node.js replacement for the Python sidecar.
 * Uses sharp for background resize/crop and @napi-rs/canvas for text compositing
 * with a bundled DejaVu Sans Bold font for consistent rendering across all environments.
 */

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import axios from "axios";
import type { FeaturedImageRequest } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1200;
const HEIGHT = 628;
const FONT_SIZE = 50;
const SMALL_FONT_SIZE = 24;
const LINE_HEIGHT = FONT_SIZE + 14;
const FONT_NAME = "DejaVuSans";

// Lazy-load @napi-rs/canvas — its prebuilt binary requires modern CPU instructions
// (SSE4/AVX) that older/basic KVM virtual CPUs may not support.
let canvasModule: typeof import("@napi-rs/canvas") | null = null;
let fontRegistered = false;

async function getCanvas() {
  if (!canvasModule) {
    canvasModule = await import("@napi-rs/canvas");
  }
  if (!fontRegistered) {
    canvasModule.GlobalFonts.registerFromPath(
      path.join(__dirname, "../../public/fonts/DejaVuSans-Bold.ttf"),
      FONT_NAME,
    );
    fontRegistered = true;
  }
  return canvasModule;
}

function wrapText(
  ctx: { measureText: (text: string) => { width: number } },
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export class FeaturedImageService {
  /** Generate a featured image and return PNG bytes. */
  async generate(params: FeaturedImageRequest): Promise<Buffer> {
    // Load background — URL fetched via HTTP, upload: prefix from uploads dir, plain filename from bundled assets
    let bgBuffer: Buffer;
    const bg = params.backgroundImageUrl;
    if (bg.startsWith("http://") || bg.startsWith("https://")) {
      const res = await axios.get<ArrayBuffer>(bg, {
        responseType: "arraybuffer",
        timeout: 30_000,
      });
      bgBuffer = Buffer.from(res.data);
    } else if (bg.startsWith("upload:")) {
      const relPath = bg.slice("upload:".length);
      const uploadPath = path.join(process.cwd(), "uploads", "category-images", relPath);
      bgBuffer = await fs.readFile(uploadPath);
    } else {
      const localPath = path.join(
        process.cwd(),
        "public",
        "category-images",
        path.basename(bg),
      );
      bgBuffer = await fs.readFile(localPath);
    }

    // Resize background with attention-based smart crop
    const resized = await sharp(bgBuffer)
      .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();

    // Compose overlay and text on canvas
    const { createCanvas, loadImage } = await getCanvas();
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    // Draw background
    ctx.drawImage(await loadImage(resized), 0, 0, WIDTH, HEIGHT);

    // Dark overlay — rgba(0,0,0,100/255) matches the Python service's opacity
    ctx.fillStyle = "rgba(0,0,0,0.39)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Category label — top left
    ctx.font = `${SMALL_FONT_SIZE}px ${FONT_NAME}`;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(params.category, 40, 30 + SMALL_FONT_SIZE);

    // Title — word-wrapped using exact pixel measurement, vertically centered
    ctx.font = `${FONT_SIZE}px ${FONT_NAME}`;
    const lines = wrapText(ctx, params.title, WIDTH - 100);
    const yStart = Math.floor((HEIGHT - lines.length * LINE_HEIGHT) / 2);

    for (let i = 0; i < lines.length; i++) {
      const x = (WIDTH - ctx.measureText(lines[i]).width) / 2;
      const y = yStart + i * LINE_HEIGHT + FONT_SIZE;
      // Drop shadow at 2px offset (matches Python)
      ctx.fillStyle = "black";
      ctx.fillText(lines[i], x + 2, y + 2);
      // White title text
      ctx.fillStyle = "white";
      ctx.fillText(lines[i], x, y);
    }

    return canvas.toBuffer("image/png") as Buffer;
  }
}
