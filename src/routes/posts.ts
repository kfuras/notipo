import type { FastifyInstance } from "fastify";
import { z } from "zod";

const syncBodySchema = z.object({
  notionPageId: z.string().min(1),
});

const publishParamsSchema = z.object({
  id: z.string().min(1),
});

export async function postRoutes(app: FastifyInstance) {
  // List posts for tenant
  app.get("/api/posts", async (request) => {
    const posts = await app.prisma.post.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { updatedAt: "desc" },
      include: { category: true },
    });
    return { data: posts };
  });

  // Get single post
  app.get<{ Params: { id: string } }>("/api/posts/:id", async (request, reply) => {
    const post = await app.prisma.post.findFirst({
      where: { id: request.params.id, tenantId: request.tenant.id },
      include: { category: true, imageMappings: true },
    });
    if (!post) return reply.notFound("Post not found");
    return { data: post };
  });

  // Trigger sync from Notion
  app.post("/api/posts/sync", async (request, reply) => {
    const body = syncBodySchema.parse(request.body);
    const tenantId = request.tenant.id;

    // Enqueue sync job
    const jobId = await app.boss.send("sync-post", {
      tenantId,
      notionPageId: body.notionPageId,
    });

    return reply.code(202).send({
      data: { jobId, message: "Sync job queued" },
    });
  });

  // Trigger publish to WordPress
  app.post<{ Params: { id: string } }>("/api/posts/:id/publish", async (request, reply) => {
    const params = publishParamsSchema.parse(request.params);
    const tenantId = request.tenant.id;

    const post = await app.prisma.post.findFirst({
      where: { id: params.id, tenantId },
    });
    if (!post) return reply.notFound("Post not found");

    // Enqueue publish job
    const jobId = await app.boss.send("publish-post", {
      tenantId,
      postId: params.id,
    });

    return reply.code(202).send({
      data: { jobId, message: "Publish job queued" },
    });
  });
}
