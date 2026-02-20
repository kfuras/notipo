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
    // Skip auth for health check, admin UI, and Notion webhook (uses HMAC signature instead)
    if (request.url === "/health" || request.url === "/favicon.ico" || request.url.startsWith("/admin") || request.url === "/api/notion/webhook") return;

    // Accept x-api-key header or ?token= query param (needed for EventSource SSE)
    const apiKey =
      (request.headers["x-api-key"] as string | undefined) ||
      (request.query as Record<string, string>)["token"];
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
