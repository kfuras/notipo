import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { fileURLToPath } from "url";
import path from "path";
import { config } from "./config.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { pgBossPlugin } from "./plugins/pg-boss.js";
import { authPlugin } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { postRoutes } from "./routes/posts.js";
import { categoryRoutes } from "./routes/categories.js";
import { settingsRoutes } from "./routes/settings.js";
import { jobRoutes } from "./routes/jobs.js";
import { adminRoutes } from "./routes/admin.js";
import { userRoutes } from "./routes/users.js";
import { eventBusPlugin } from "./plugins/event-bus.js";
import { eventsRoutes } from "./routes/events.js";
import { notionWebhookRoutes } from "./routes/notion-webhook.js";
import { registerAllJobs } from "./jobs/index.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === "development" && {
        transport: { target: "pino-pretty" },
      }),
    },
  });

  // Convert ZodError validation failures to 400 Bad Request
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      });
    }
    throw error; // let Fastify handle everything else
  });

  // Admin UI — served at /admin/
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/admin/",
  });
  app.get("/admin", (_req, reply) => reply.redirect("/admin/"));

  // Plugins
  await app.register(cors);
  await app.register(sensible);
  await app.register(prismaPlugin);
  await app.register(pgBossPlugin);
  await app.register(authPlugin);
  await app.register(eventBusPlugin);

  // Jobs
  await registerAllJobs(app.boss, app.prisma, app.eventBus);

  // Routes
  await app.register(healthRoutes);
  await app.register(eventsRoutes);
  await app.register(postRoutes);
  await app.register(categoryRoutes);
  await app.register(settingsRoutes);
  await app.register(jobRoutes);
  await app.register(adminRoutes);
  await app.register(userRoutes);
  await app.register(notionWebhookRoutes);

  return app;
}
