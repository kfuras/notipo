import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CredentialService } from "../services/credential.service.js";

const notionSettingsSchema = z.object({
  accessToken: z.string().min(1),
  workspaceId: z.string().optional(),
  databaseId: z.string().optional(),
  triggerStatus: z.string().optional(),
  publishTriggerStatus: z.string().optional(),
  updateTriggerStatus: z.string().optional(),
});

const wordpressSettingsSchema = z.object({
  siteUrl: z.string().url(),
  username: z.string().min(1),
  appPassword: z.string().min(1),
});

const generalSettingsSchema = z.object({
  codeHighlighter: z.enum(["PRISMATIC", "WP_CODE", "HIGHLIGHT_JS", "PRISM_JS"]).optional(),
  triggerStatus: z.string().optional(),
  publishTriggerStatus: z.string().optional(),
  updateTriggerStatus: z.string().optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  /** GET /api/settings — tenant config overview (no secrets) */
  app.get("/api/settings", async (request) => {
    const tenant = await app.prisma.tenant.findUniqueOrThrow({
      where: { id: request.tenant.id },
      select: {
        notionCredentials: true,
        wordpressCredentials: true,
        notionDatabaseId: true,
        notionTriggerStatus: true,
        notionPublishTriggerStatus: true,
        notionUpdateTriggerStatus: true,
        wpSiteUrl: true,
        codeHighlighter: true,
      },
    });

    return {
      data: {
        notion: {
          configured: tenant.notionCredentials !== null,
          databaseId: tenant.notionDatabaseId,
          triggerStatus: tenant.notionTriggerStatus,
          publishTriggerStatus: tenant.notionPublishTriggerStatus,
          updateTriggerStatus: tenant.notionUpdateTriggerStatus,
        },
        wordpress: {
          configured: tenant.wordpressCredentials !== null,
          siteUrl: tenant.wpSiteUrl,
        },
        codeHighlighter: tenant.codeHighlighter,
      },
    };
  });

  /** PUT /api/settings/notion — set Notion credentials + optional DB config */
  app.put("/api/settings/notion", async (request, reply) => {
    const body = notionSettingsSchema.parse(request.body);
    const credService = new CredentialService(app.prisma);

    await credService.setNotionCredentials(request.tenant.id, {
      accessToken: body.accessToken,
      workspaceId: body.workspaceId,
    });

    if (body.databaseId !== undefined || body.triggerStatus !== undefined || body.publishTriggerStatus !== undefined || body.updateTriggerStatus !== undefined || body.workspaceId !== undefined) {
      await app.prisma.tenant.update({
        where: { id: request.tenant.id },
        data: {
          ...(body.databaseId !== undefined && { notionDatabaseId: body.databaseId }),
          ...(body.triggerStatus !== undefined && { notionTriggerStatus: body.triggerStatus }),
          ...(body.publishTriggerStatus !== undefined && { notionPublishTriggerStatus: body.publishTriggerStatus }),
          ...(body.updateTriggerStatus !== undefined && { notionUpdateTriggerStatus: body.updateTriggerStatus }),
          ...(body.workspaceId !== undefined && { notionWorkspaceId: body.workspaceId }),
        },
      });
    }

    return reply.code(204).send();
  });

  /** PUT /api/settings/wordpress — set WordPress credentials */
  app.put("/api/settings/wordpress", async (request, reply) => {
    const body = wordpressSettingsSchema.parse(request.body);
    const credService = new CredentialService(app.prisma);

    await credService.setWordPressCredentials(request.tenant.id, {
      siteUrl: body.siteUrl,
      username: body.username,
      appPassword: body.appPassword,
    });

    return reply.code(204).send();
  });

  /** PATCH /api/settings — update non-secret config */
  app.patch("/api/settings", async (request, reply) => {
    const body = generalSettingsSchema.parse(request.body);

    await app.prisma.tenant.update({
      where: { id: request.tenant.id },
      data: {
        ...(body.codeHighlighter !== undefined && { codeHighlighter: body.codeHighlighter }),
        ...(body.triggerStatus !== undefined && { notionTriggerStatus: body.triggerStatus }),
        ...(body.publishTriggerStatus !== undefined && { notionPublishTriggerStatus: body.publishTriggerStatus }),
        ...(body.updateTriggerStatus !== undefined && { notionUpdateTriggerStatus: body.updateTriggerStatus }),
      },
    });

    return reply.code(204).send();
  });
}
