import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CredentialService } from "../services/credential.service.js";
import { WordPressService } from "../services/wordpress.service.js";
import { syncWpCategories } from "../lib/sync-wp-categories.js";

const updateCategorySchema = z.object({
  backgroundImage: z.string().min(1).nullable(),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/api/categories", async (request) => {
    const categories = await app.prisma.category.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    });
    return { data: categories };
  });

  /** Sync categories from the tenant's WordPress site into the DB. */
  app.post("/api/categories/sync", async (request, reply) => {
    const credService = new CredentialService(app.prisma);
    const wpCreds = await credService.getWordPressCredentials(request.tenant.id);
    if (!wpCreds) return reply.badRequest("WordPress credentials not configured");

    const wp = new WordPressService(wpCreds);
    const count = await syncWpCategories(app.prisma, request.tenant.id, wp);

    const categories = await app.prisma.category.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    });
    return { data: categories, synced: count };
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

  /** Fetch tags from the tenant's WordPress site (live, not stored). */
  app.get("/api/wordpress/tags", async (request, reply) => {
    const credService = new CredentialService(app.prisma);
    const wpCreds = await credService.getWordPressCredentials(request.tenant.id);
    if (!wpCreds) return reply.badRequest("WordPress credentials not configured");

    const wp = new WordPressService(wpCreds);
    const tags = await wp.listTags();
    return { data: tags };
  });
}
