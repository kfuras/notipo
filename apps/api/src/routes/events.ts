import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

interface JobUpdateEvent {
  tenantId: string;
  jobId: string;
  type: string;
  status: string;
  postId?: string;
}

export async function eventsRoutes(app: FastifyInstance) {
  /** GET /api/events — SSE stream of job updates scoped to the authenticated tenant */
  app.get("/api/events", async (request, reply) => {
    const tenantId = request.tenant.id;

    // CORS headers must be set manually because reply.hijack() bypasses Fastify's response pipeline
    const origin = request.headers.origin;
    const allowed = config.FRONTEND_URL
      ? [config.FRONTEND_URL, "http://localhost:3001"]
      : null;
    if (origin && (!allowed || allowed.includes(origin))) {
      reply.raw.setHeader("Access-Control-Allow-Origin", origin);
    }

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders();

    const send = (event: string, data: object) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial ping so the client knows the connection is alive
    reply.raw.write(": connected\n\n");

    const onJobUpdate = (payload: JobUpdateEvent) => {
      if (payload.tenantId !== tenantId) return;
      send("job_update", payload);
    };

    app.eventBus.on("job:update", onJobUpdate);

    // Keep-alive ping every 15 seconds (Render and some proxies have short idle timeouts)
    const keepAlive = setInterval(() => {
      reply.raw.write(": ping\n\n");
    }, 15_000);

    // Cleanup on disconnect
    request.raw.on("close", () => {
      app.eventBus.off("job:update", onJobUpdate);
      clearInterval(keepAlive);
    });

    // Tell Fastify we're handling the response ourselves
    await reply.hijack();
  });
}
