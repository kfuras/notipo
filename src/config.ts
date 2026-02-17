import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().min(64),
  JWT_SECRET: z.string().min(8),
  API_KEY: z.string().min(8),
  IMAGE_SERVICE_URL: z.string().url().default("http://localhost:8100"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Optional: Notion defaults (used for single-tenant Phase 1)
  NOTION_TOKEN: z.string().optional(),
  NOTION_DATABASE_ID: z.string().optional(),

  // Optional: WordPress defaults (used for single-tenant Phase 1)
  WP_SITE_URL: z.string().optional(),
  WP_USERNAME: z.string().optional(),
  WP_APP_PASSWORD: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
