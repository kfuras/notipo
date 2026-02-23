import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function prisma(app: FastifyInstance) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const client = new PrismaClient({
    adapter,
    log: app.log.level === "debug" ? ["query", "info", "warn", "error"] : ["error"],
  });

  await client.$connect();
  app.decorate("prisma", client);

  app.addHook("onClose", async () => {
    await client.$disconnect();
  });
}

export const prismaPlugin = fp(prisma, { name: "prisma" });
