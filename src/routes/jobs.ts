import type { FastifyInstance } from "fastify";
import { z } from "zod";

const listJobsQuerySchema = z.object({
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  type: z
    .enum([
      "NOTION_POLL",
      "SYNC_POST",
      "PROCESS_IMAGES",
      "GENERATE_FEATURED_IMAGE",
      "PUBLISH_POST",
      "UPDATE_POST",
    ])
    .optional(),
  postId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function jobRoutes(app: FastifyInstance) {
  /** GET /api/jobs — list jobs for the tenant */
  app.get("/api/jobs", async (request) => {
    const query = listJobsQuerySchema.parse(request.query);

    const [jobs, total] = await Promise.all([
      app.prisma.job.findMany({
        where: {
          tenantId: request.tenant.id,
          ...(query.status && { status: query.status }),
          ...(query.type && { type: query.type }),
          ...(query.postId && { postId: query.postId }),
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          type: true,
          status: true,
          postId: true,
          error: true,
          pgBossJobId: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
        },
      }),
      app.prisma.job.count({
        where: {
          tenantId: request.tenant.id,
          ...(query.status && { status: query.status }),
          ...(query.type && { type: query.type }),
          ...(query.postId && { postId: query.postId }),
        },
      }),
    ]);

    return { data: jobs, total, limit: query.limit, offset: query.offset };
  });

  /** GET /api/jobs/:id — single job detail */
  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
    const job = await app.prisma.job.findFirst({
      where: { id: request.params.id, tenantId: request.tenant.id },
      include: {
        post: { select: { id: true, title: true, status: true, wpUrl: true } },
      },
    });

    if (!job) return reply.notFound("Job not found");

    return { data: job };
  });
}
