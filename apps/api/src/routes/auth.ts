import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ route: "auth" });

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  blogName: z.string().min(1).max(100),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function authRoutes(app: FastifyInstance) {
  /** GET /api/auth/providers — what auth methods are available */
  app.get("/api/auth/providers", async () => {
    return {
      data: {
        password: true,
        signup: config.ALLOW_SIGNUP,
      },
    };
  });

  /** POST /api/auth/register — create a new tenant with email+password */
  app.post("/api/auth/register", async (request, reply) => {
    if (!config.ALLOW_SIGNUP) {
      return reply.forbidden("Registration is disabled");
    }

    const body = registerSchema.parse(request.body);

    // Check for existing password-auth user with this email
    const existing = await app.prisma.user.findFirst({
      where: { email: body.email, passwordHash: { not: null } },
    });
    if (existing) {
      return reply.conflict("An account with this email already exists");
    }

    // Generate unique slug
    let slug = slugify(body.blogName);
    if (!slug) slug = "blog";
    let suffix = 0;
    while (await app.prisma.tenant.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(body.blogName) || "blog"}-${suffix}`;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const apiKey = randomBytes(32).toString("hex");

    const tenant = await app.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: body.blogName,
          slug,
          users: {
            create: {
              email: body.email,
              name: body.name,
              role: "OWNER",
              apiKey,
              passwordHash,
            },
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          users: {
            select: { id: true, email: true, name: true, role: true, apiKey: true },
          },
        },
      });
      return t;
    });

    const user = tenant.users[0];
    log.info({ tenantId: tenant.id, email: body.email }, "New tenant registered");

    return reply.code(201).send({
      data: {
        apiKey: user.apiKey,
        user: { id: user.id, email: user.email, name: user.name },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      },
    });
  });

  /** POST /api/auth/login — verify email+password, return API key */
  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await app.prisma.user.findFirst({
      where: { email: body.email, passwordHash: { not: null } },
      select: {
        id: true,
        email: true,
        name: true,
        apiKey: true,
        passwordHash: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!user || !user.passwordHash) {
      return reply.unauthorized("Invalid email or password");
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.unauthorized("Invalid email or password");
    }

    return {
      data: {
        apiKey: user.apiKey,
        user: { id: user.id, email: user.email, name: user.name },
        tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
      },
    };
  });
}
