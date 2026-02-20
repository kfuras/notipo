import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config.js";
import { CredentialService } from "../services/credential.service.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ route: "notion-oauth" });

export async function notionOAuthRoutes(app: FastifyInstance) {
  /** GET /api/notion/oauth/authorize — generate the Notion OAuth URL for this tenant */
  app.get("/api/notion/oauth/authorize", async (request, reply) => {
    if (!config.NOTION_OAUTH_CLIENT_ID || !config.NOTION_OAUTH_CLIENT_SECRET || !config.NOTION_OAUTH_REDIRECT_URI) {
      return reply.code(501).send({ message: "Notion OAuth not configured" });
    }

    const state = signState(request.tenant.id);

    const params = new URLSearchParams({
      client_id: config.NOTION_OAUTH_CLIENT_ID,
      redirect_uri: config.NOTION_OAUTH_REDIRECT_URI,
      response_type: "code",
      owner: "user",
      state,
    });

    return { data: { url: `https://api.notion.com/v1/oauth/authorize?${params}` } };
  });

  /** GET /api/notion/oauth/callback — handle the redirect from Notion after authorization */
  app.get("/api/notion/oauth/callback", async (request, reply) => {
    const query = request.query as Record<string, string>;

    if (query.error) {
      log.warn({ error: query.error }, "Notion OAuth error");
      return reply.redirect(`/admin/?notion_oauth=error&reason=${encodeURIComponent(query.error)}`);
    }

    const { code, state } = query;
    if (!code || !state) {
      return reply.redirect("/admin/?notion_oauth=error&reason=missing_params");
    }

    // Verify HMAC-signed state and extract tenant ID
    let tenantId: string;
    try {
      tenantId = verifyState(state);
    } catch {
      return reply.redirect("/admin/?notion_oauth=error&reason=invalid_state");
    }

    // Exchange authorization code for access token
    try {
      const credentials = Buffer.from(
        `${config.NOTION_OAUTH_CLIENT_ID}:${config.NOTION_OAUTH_CLIENT_SECRET}`,
      ).toString("base64");

      const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.NOTION_OAUTH_REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        log.error({ status: tokenRes.status, body: err }, "Notion token exchange failed");
        return reply.redirect("/admin/?notion_oauth=error&reason=token_exchange_failed");
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        workspace_id: string;
        workspace_name?: string;
        bot_id?: string;
      };

      // Store credentials using the same path as manual token entry
      const credService = new CredentialService(app.prisma);
      await credService.setNotionCredentials(tenantId, {
        accessToken: tokenData.access_token,
        workspaceId: tokenData.workspace_id,
      });

      await app.prisma.tenant.update({
        where: { id: tenantId },
        data: { notionAuthMode: "oauth" },
      });

      log.info({ tenantId, workspaceId: tokenData.workspace_id }, "Notion OAuth completed");
      return reply.redirect("/admin/?notion_oauth=success");
    } catch (err) {
      log.error({ err }, "Notion OAuth callback error");
      return reply.redirect("/admin/?notion_oauth=error&reason=internal_error");
    }
  });
}

// ── HMAC-signed state (no server-side session storage) ───────────────────────

function signState(tenantId: string): string {
  const payload = JSON.stringify({ tenantId, ts: Date.now() });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", config.ENCRYPTION_KEY)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifyState(state: string): string {
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) throw new Error("malformed state");

  const expected = createHmac("sha256", config.ENCRYPTION_KEY)
    .update(payloadB64)
    .digest("base64url");

  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    throw new Error("invalid signature");
  }

  const { tenantId, ts } = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  if (Date.now() - ts > 600_000) throw new Error("state expired");

  return tenantId;
}
