import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CredentialService } from "../services/credential.service.js";
import { WordPressService } from "../services/wordpress.service.js";
import { NotionService } from "../services/notion.service.js";
import { syncWpCategories } from "../lib/sync-wp-categories.js";

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

  /** Update a category's background image. */
  app.patch<{ Params: { id: string } }>("/api/categories/:id", async (request, reply) => {
    const body = updateCategorySchema.parse(request.body);

    const category = await app.prisma.category.updateMany({
      where: { id: request.params.id, tenantId: request.tenant.id },
      data: body,
    });

    if (category.count === 0) return reply.notFound("Category not found");

    return { data: await app.prisma.category.findUnique({ where: { id: request.params.id } }) };
  });

  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (request, reply) => {
    const postCount = await app.prisma.post.count({
      where: { categoryId: request.params.id, tenantId: request.tenant.id },
    });
    if (postCount > 0) {
      return reply.badRequest(`Cannot delete category: ${postCount} post(s) still assigned to it`);
    }

    const result = await app.prisma.category.deleteMany({
      where: { id: request.params.id, tenantId: request.tenant.id },
    });
    if (result.count === 0) return reply.notFound("Category not found");
    return reply.code(204).send();
  });
}
