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

interface CategorySeed {
  name: string;
  wpCategoryId?: number;
  wpTagIds?: number[];
  /** Plain filename (e.g. automation.png) or full https:// URL */
  backgroundImage?: string;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });


async function main() {
  const tenantName = process.env.SEED_TENANT_NAME ?? "Dev Tenant";
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? "dev";
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "dev@pressflow.local";
  const apiKey = process.env.SEED_API_KEY || process.env.API_KEY || "dev-api-key-change-me";
  const triggerStatus = process.env.SEED_NOTION_TRIGGER_STATUS ?? "Ready to Publish";

  // Build tag name → ID lookup from SEED_WP_TAGS, e.g. {"tech":200030,"featured":100013}
  const tagLookup: Record<string, number> = process.env.SEED_WP_TAGS
    ? (JSON.parse(process.env.SEED_WP_TAGS) as Record<string, number>)
    : {};

  // Read SEED_CAT_1, SEED_CAT_2, … until no more vars are found.
  // Format: "Name | WP Category ID | tag1,tag2 | backgroundImage"
  const categories: CategorySeed[] = [];
  for (let i = 1; ; i++) {
    const raw = process.env[`SEED_CAT_${i}`];
    if (!raw) break;
    const [name, wpCatStr, tagsStr, bgImage] = raw.split("|").map((s) => s.trim());
    const wpCategoryId = wpCatStr ? parseInt(wpCatStr, 10) : undefined;
    const wpTagNames = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const wpTagIds = wpTagNames
      .map((n) => {
        const id = tagLookup[n];
        if (id === undefined) console.warn(`  Warning: tag "${n}" not found in SEED_WP_TAGS`);
        return id;
      })
      .filter((id): id is number => id !== undefined);
    categories.push({
      name,
      wpCategoryId,
      wpTagIds,
      backgroundImage: bgImage || undefined,
    });
  }

  if (categories.length === 0) {
    // Fallback for bare dev setup with no SEED_CAT_* vars
    categories.push({ name: "Tech" }, { name: "Automation" }, { name: "Tutorial" });
  }

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

  // Create categories
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: cat.name } },
      // Only overwrite WP fields when explicitly provided — prevents wiping IDs set via API
      update: {
        ...(cat.wpCategoryId !== undefined && { wpCategoryId: cat.wpCategoryId }),
        ...(cat.wpTagIds !== undefined && { wpTagIds: cat.wpTagIds }),
        ...(cat.backgroundImage !== undefined && { backgroundImage: cat.backgroundImage }),
      },
      create: {
        name: cat.name,
        tenantId: tenant.id,
        wpCategoryId: cat.wpCategoryId ?? null,
        wpTagIds: cat.wpTagIds ?? [],
        backgroundImage: cat.backgroundImage ?? null,
      },
    });
  }

  console.log(
    `Seed complete: tenant "${tenantName}" (${tenantSlug}), ${categories.length} categories, API key: ${apiKey}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
