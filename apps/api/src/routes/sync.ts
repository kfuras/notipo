import type { FastifyInstance } from "fastify";
import { pollTenant } from "../lib/poll-tenant.js";
import { canUseWebhooks } from "../lib/plan-limits.js";

// Per-tenant cooldown to avoid hitting Notion's 3 req/sec rate limit
const lastSyncAt = new Map<string, number>();
const COOLDOWN_MS = 15_000; // 15 seconds between manual syncs

export async function syncRoutes(app: FastifyInstance) {
  app.post("/api/sync-now", async (request, reply) => {
    const tenantId = request.tenant.id;

    const last = lastSyncAt.get(tenantId) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return reply.code(429).send({ error: `Please wait ${waitSec}s before syncing again` });
    }

    const tenant = await app.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant?.notionCredentials || !tenant.notionDatabaseId) {
      return reply.code(400).send({ error: "Notion is not configured" });
    }

    if (!canUseWebhooks(tenant.plan, tenant.trialEndsAt)) {
      return reply.code(403).send({ error: "Instant sync is available on the Pro plan. Upgrade to unlock." });
    }

    lastSyncAt.set(tenantId, Date.now());
    await pollTenant(app.boss, app.prisma, tenant);

    return reply.code(202).send({ data: { message: "Sync triggered" } });
  });
}
