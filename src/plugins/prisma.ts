import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function prisma(app: FastifyInstance) {
  const client = new PrismaClient({
    log: app.log.level === "debug" ? ["query", "info", "warn", "error"] : ["error"],
  });

  await client.$connect();
  app.decorate("prisma", client);

  app.addHook("onClose", async () => {
    await client.$disconnect();
  });
}

export const prismaPlugin = fp(prisma, { name: "prisma" });
