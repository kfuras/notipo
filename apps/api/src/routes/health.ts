import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", { config: { rawBody: false } }, async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
