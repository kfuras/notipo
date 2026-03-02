import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function userRoutes(app: FastifyInstance) {
  /** GET /api/users — list users in the tenant */
  app.get("/api/users", async (request) => {
    const users = await app.prisma.user.findMany({
      where: { tenantId: request.tenant.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        // Never return the raw apiKey in list responses
      },
    });
    return { data: users };
  });

  /** POST /api/users — create a user in the tenant */
  app.post("/api/users", async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    // Only OWNER can create ADMIN or OWNER users
    if ((body.role === "OWNER" || body.role === "ADMIN") && request.user.role !== "OWNER") {
      return reply.forbidden("Only the tenant owner can create admin or owner users");
    }

    const apiKey = randomBytes(32).toString("hex");

    const user = await app.prisma.user.create({
      data: {
        ...body,
        apiKey,
        tenantId: request.tenant.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        apiKey: true, // returned only at creation
        createdAt: true,
      },
    });

    return reply.code(201).send({ data: user });
  });

  /** POST /api/users/:id/rotate-key — issue a new API key */
  app.post<{ Params: { id: string } }>("/api/users/:id/rotate-key", async (request, reply) => {
    const newKey = randomBytes(32).toString("hex");

    const user = await app.prisma.user.updateMany({
      where: { id: request.params.id, tenantId: request.tenant.id },
      data: { apiKey: newKey },
    });

    if (user.count === 0) return reply.notFound("User not found");

    return { data: { apiKey: newKey } };
  });

  /** DELETE /api/users/:id — remove a user from the tenant */
  app.delete<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const deleted = await app.prisma.user.deleteMany({
      where: { id: request.params.id, tenantId: request.tenant.id },
    });

    if (deleted.count === 0) return reply.notFound("User not found");

    return reply.code(204).send();
  });
}
