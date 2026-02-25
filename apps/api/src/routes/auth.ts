import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { sendEmail } from "../lib/email.js";
import { createResetToken, verifyResetToken } from "../lib/reset-token.js";

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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
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

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const tenant = await app.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: body.blogName,
          slug,
          plan: "TRIAL",
          trialEndsAt,
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
          plan: true,
          trialEndsAt: true,
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

  /** POST /api/auth/forgot-password — request a password reset email */
  app.post("/api/auth/forgot-password", async (request) => {
    const { email } = forgotPasswordSchema.parse(request.body);

    const user = await app.prisma.user.findFirst({
      where: { email, passwordHash: { not: null } },
      select: { id: true },
    });

    if (user) {
      const token = createResetToken(user.id);

      const baseUrl = config.NOTION_OAUTH_REDIRECT_URI
        ? new URL(config.NOTION_OAUTH_REDIRECT_URI).origin
        : "https://notipo.com";
      const resetUrl = `${baseUrl}/auth/reset?token=${token}`;

      await sendEmail(
        email,
        "Reset your password — Notipo",
        `<p>You requested a password reset.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
        <p style="color:#888;font-size:13px;">Or copy this link: ${resetUrl}</p>
        <p style="color:#888;font-size:13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>`,
      );

      log.info({ email }, "Password reset email sent");
    }

    // Always return success to prevent email enumeration
    return { message: "If that email exists, a reset link has been sent." };
  });

  /** POST /api/auth/reset-password — set a new password using a reset token */
  app.post("/api/auth/reset-password", async (request, reply) => {
    const { token, password } = resetPasswordSchema.parse(request.body);

    const result = verifyResetToken(token);
    if (!result) {
      return reply.badRequest("Invalid or expired reset link. Please request a new one.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await app.prisma.user.update({
      where: { id: result.userId },
      data: { passwordHash },
    });

    log.info({ userId: result.userId }, "Password reset completed");
    return { message: "Password has been reset." };
  });
}
