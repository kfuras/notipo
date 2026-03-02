import type { FastifyInstance } from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { CredentialService } from "../services/credential.service.js";
import { WordPressService } from "../services/wordpress.service.js";
import { NotionService } from "../services/notion.service.js";
import { syncWpCategories } from "../lib/sync-wp-categories.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "category-images");

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Delete an uploaded file if the backgroundImage value uses the upload: prefix. */
async function deleteUploadedFile(backgroundImage: string | null) {
  if (!backgroundImage?.startsWith("upload:")) return;
  const relPath = backgroundImage.slice("upload:".length);
  const resolved = path.resolve(UPLOADS_DIR, relPath);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return; // path traversal guard
  await fs.unlink(resolved).catch(() => {});
}

const updateCategorySchema = z.object({
  backgroundImage: z.string().min(1).nullable(),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/api/categories", async (request) => {
    const categories = await app.prisma.category.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { name: "asc" },
    });
    return { data: categories };
  });

  app.get("/api/tags", async (request) => {
    const tags = await app.prisma.tag.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { name: "asc" },
    });
    return { data: tags };
  });

  /** Sync categories and tags from the tenant's WordPress site into the DB. */
  app.post("/api/categories/sync", async (request, reply) => {
    const credService = new CredentialService(app.prisma);
    const wpCreds = await credService.getWordPressCredentials(request.tenant.id);
    if (!wpCreds) return reply.badRequest("WordPress credentials not configured");

    const wp = new WordPressService(wpCreds);
    const notionCreds = await credService.getNotionCredentials(request.tenant.id);
    const tenant = await app.prisma.tenant.findUniqueOrThrow({ where: { id: request.tenant.id }, select: { notionDatabaseId: true } });
    const notion = notionCreds ? new NotionService(notionCreds.accessToken) : undefined;
    const synced = await syncWpCategories(app.prisma, request.tenant.id, wp, notion, tenant.notionDatabaseId ?? undefined);

    const [categories, tags] = await Promise.all([
      app.prisma.category.findMany({ where: { tenantId: request.tenant.id }, orderBy: { name: "asc" } }),
      app.prisma.tag.findMany({ where: { tenantId: request.tenant.id }, orderBy: { name: "asc" } }),
    ]);
    return { data: { categories, tags }, synced };
  });

  /** Update a category's background image (JSON — accepts a URL or filename string). */
  app.patch<{ Params: { id: string } }>("/api/categories/:id", async (request, reply) => {
    const body = updateCategorySchema.parse(request.body);

    const category = await app.prisma.category.updateMany({
      where: { id: request.params.id, tenantId: request.tenant.id },
      data: body,
    });

    if (category.count === 0) return reply.notFound("Category not found");

    return { data: await app.prisma.category.findFirst({ where: { id: request.params.id, tenantId: request.tenant.id } }) };
  });

  /** Upload a background image for a category (multipart form-data). */
  app.post<{ Params: { id: string } }>("/api/categories/:id/background-image", async (request, reply) => {
    const tenantId = request.tenant.id;
    const categoryId = request.params.id;

    const category = await app.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!category) return reply.notFound("Category not found");

    const file = await request.file();
    if (!file) return reply.badRequest("No file uploaded");

    const ext = ALLOWED_MIME_TYPES[file.mimetype];
    if (!ext) {
      return reply.badRequest(`Invalid file type: ${file.mimetype}. Allowed: ${Object.keys(ALLOWED_MIME_TYPES).join(", ")}`);
    }

    const filename = `${categoryId}-${Date.now()}.${ext}`;
    const relPath = `${tenantId}/${filename}`;
    const dir = path.join(UPLOADS_DIR, tenantId);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, filename);
    await pipeline(file.file, createWriteStream(filePath));

    if (file.file.truncated) {
      await fs.unlink(filePath).catch(() => {});
      return reply.badRequest("File too large. Maximum size is 5 MB.");
    }

    // Delete old uploaded file if replacing
    await deleteUploadedFile(category.backgroundImage);

    const updated = await app.prisma.category.update({
      where: { id: categoryId },
      data: { backgroundImage: `upload:${relPath}` },
    });

    return { data: updated };
  });

  /** Remove the background image for a category. */
  app.delete<{ Params: { id: string } }>("/api/categories/:id/background-image", async (request, reply) => {
    const tenantId = request.tenant.id;
    const categoryId = request.params.id;

    const category = await app.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!category) return reply.notFound("Category not found");

    await deleteUploadedFile(category.backgroundImage);

    const updated = await app.prisma.category.update({
      where: { id: categoryId },
      data: { backgroundImage: null },
    });

    return { data: updated };
  });

  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (request, reply) => {
    const category = await app.prisma.category.findFirst({
      where: { id: request.params.id, tenantId: request.tenant.id },
    });
    if (!category) return reply.notFound("Category not found");

    const postCount = await app.prisma.post.count({
      where: { categoryId: request.params.id, tenantId: request.tenant.id },
    });
    if (postCount > 0) {
      return reply.badRequest(`Cannot delete category: ${postCount} post(s) still assigned to it`);
    }

    // Clean up uploaded file before deleting
    await deleteUploadedFile(category.backgroundImage);

    await app.prisma.category.delete({ where: { id: request.params.id } });
    return reply.code(204).send();
  });
}
