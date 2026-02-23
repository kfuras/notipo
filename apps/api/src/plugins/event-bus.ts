import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { EventEmitter } from "events";

declare module "fastify" {
  interface FastifyInstance {
    eventBus: EventEmitter;
  }
}

async function eventBus(app: FastifyInstance) {
  const bus = new EventEmitter();
  bus.setMaxListeners(100); // support many concurrent SSE clients
  app.decorate("eventBus", bus);
}

export const eventBusPlugin = fp(eventBus, { name: "event-bus" });
