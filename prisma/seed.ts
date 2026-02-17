import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create dev tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "dev" },
    update: {},
    create: {
      name: "Dev Tenant",
      slug: "dev",
      codeHighlighter: "PRISMATIC",
      notionPollIntervalSec: 60,
      notionTriggerStatus: "Ready to Publish",
    },
  });

  // Create dev user with API key
  await prisma.user.upsert({
    where: { email_tenantId: { email: "dev@blog-compiler.local", tenantId: tenant.id } },
    update: {},
    create: {
      email: "dev@blog-compiler.local",
      name: "Dev User",
      role: "OWNER",
      apiKey: "dev-api-key-change-me",
      tenantId: tenant.id,
    },
  });

  // Create sample categories
  const categories = ["Tech", "Automation", "Tutorial"];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: {
        name,
        tenantId: tenant.id,
      },
    });
  }

  console.log("Seed complete: tenant, user, and categories created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
