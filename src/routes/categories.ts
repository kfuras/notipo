import type { FastifyInstance } from "fastify";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1),
  wpCategoryId: z.number().optional(),
  wpTagIds: z.array(z.number()).optional(),
  backgroundImage: z.string().min(1).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  wpCategoryId: z.number().nullable().optional(),
  wpTagIds: z.array(z.number()).optional(),
  backgroundImage: z.string().min(1).nullable().optional(),
});

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/api/categories", async (request) => {
    const categories = await app.prisma.category.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { name: "asc" },
    });
    return { data: categories };
  });

  app.post("/api/categories", async (request) => {
    const body = createCategorySchema.parse(request.body);
    const category = await app.prisma.category.create({
      data: {
        ...body,
        wpTagIds: body.wpTagIds ?? [],
        tenantId: request.tenant.id,
      },
    });
    return { data: category };
  });

  app.patch<{ Params: { id: string } }>("/api/categories/:id", async (request, reply) => {
    const body = updateCategorySchema.parse(request.body);

    const category = await app.prisma.category.updateMany({
      where: { id: request.params.id, tenantId: request.tenant.id },
      data: body,
    });

    if (category.count === 0) return reply.notFound("Category not found");

    return { data: await app.prisma.category.findUnique({ where: { id: request.params.id } }) };
  });
}
