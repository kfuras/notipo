import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { createCipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required for seeding encrypted credentials");
  }
  return Buffer.from(key, "hex");
}

function encryptJson(data: Record<string, unknown>): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });


async function main() {
  const tenantName = process.env.SEED_TENANT_NAME ?? "Dev Tenant";
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? "dev";
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "dev@notipo.com";
  const apiKey = process.env.SEED_API_KEY || process.env.API_KEY || "dev-api-key-change-me";
  const triggerStatus = process.env.SEED_NOTION_TRIGGER_STATUS ?? "Ready to Publish";

  // Create or update tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, notionTriggerStatus: triggerStatus },
    create: {
      name: tenantName,
      slug: tenantSlug,
      codeHighlighter: "WP_CODE",
      notionTriggerStatus: triggerStatus,
    },
  });

  // Store encrypted Notion credentials if provided
  if (process.env.NOTION_TOKEN) {
    const notionCreds = encryptJson({
      accessToken: process.env.NOTION_TOKEN,
      ...(process.env.NOTION_WORKSPACE_ID && { workspaceId: process.env.NOTION_WORKSPACE_ID }),
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        notionCredentials: notionCreds,
        ...(process.env.NOTION_DATABASE_ID && { notionDatabaseId: process.env.NOTION_DATABASE_ID }),
      },
    });
    console.log("  Notion credentials stored");
  }

  // Store encrypted WordPress credentials if provided
  if (process.env.WP_SITE_URL && process.env.WP_USERNAME && process.env.WP_APP_PASSWORD) {
    const wpCreds = encryptJson({
      siteUrl: process.env.WP_SITE_URL,
      username: process.env.WP_USERNAME,
      appPassword: process.env.WP_APP_PASSWORD,
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        wordpressCredentials: wpCreds,
        wpSiteUrl: process.env.WP_SITE_URL,
      },
    });
    console.log("  WordPress credentials stored");
  }

  // Create owner user
  await prisma.user.upsert({
    where: { email_tenantId: { email: ownerEmail, tenantId: tenant.id } },
    update: { apiKey },
    create: {
      email: ownerEmail,
      name: tenantName,
      role: "OWNER",
      apiKey,
      tenantId: tenant.id,
    },
  });

  console.log(
    `Seed complete: tenant "${tenantName}" (${tenantSlug}), API key: ${apiKey}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
