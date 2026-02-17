import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { pgBossPlugin } from "./plugins/pg-boss.js";
import { authPlugin } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { postRoutes } from "./routes/posts.js";
import { categoryRoutes } from "./routes/categories.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === "development" && {
        transport: { target: "pino-pretty" },
      }),
    },
  });

  // Plugins
  await app.register(cors);
  await app.register(sensible);
  await app.register(prismaPlugin);
  await app.register(pgBossPlugin);
  await app.register(authPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(postRoutes);
  await app.register(categoryRoutes);

  return app;
}
