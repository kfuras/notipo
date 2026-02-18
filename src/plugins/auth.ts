import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";

interface TenantContext {
  id: string;
  slug: string;
}

declare module "fastify" {
  interface FastifyRequest {
    tenant: TenantContext;
    isAdmin: boolean;
  }
}

async function auth(app: FastifyInstance) {
  app.decorateRequest("tenant", null as unknown as TenantContext);
  app.decorateRequest("isAdmin", false);

  app.addHook("onRequest", async (request: FastifyRequest, reply) => {
    // Skip auth for health check and admin UI static files
    if (request.url === "/health" || request.url.startsWith("/admin")) return;

    const apiKey = request.headers["x-api-key"] as string | undefined;
    if (!apiKey) {
      return reply.unauthorized("Missing x-api-key header");
    }

    // Admin routes use the env API_KEY — no tenant context
    if (request.url.startsWith("/api/admin")) {
      if (apiKey !== config.API_KEY) {
        return reply.unauthorized("Invalid admin API key");
      }
      request.isAdmin = true;
      return;
    }

    // All other routes: look up user by API key in the DB
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
