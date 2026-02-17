import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

interface TenantContext {
  id: string;
  slug: string;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantContext;
  }
}

async function auth(app: FastifyInstance) {
  app.decorateRequest("tenant", null);

  app.addHook("onRequest", async (request: FastifyRequest, reply) => {
    // Skip auth for health check
    if (request.url === "/health") return;

    const apiKey = request.headers["x-api-key"] as string | undefined;
    if (!apiKey) {
      return reply.unauthorized("Missing x-api-key header");
    }

    const user = await app.prisma.user.findUnique({
      where: { apiKey },
      include: { tenant: { select: { id: true, slug: true } } },
    });

    if (!user) {
      return reply.unauthorized("Invalid API key");
    }

    request.tenant = user.tenant;
  });
}

export const authPlugin = fp(auth, {
  name: "auth",
  dependencies: ["prisma"],
});
