/**
 * Register all pg-boss job handlers and cron schedules.
 */

import type PgBoss from "pg-boss";
import type { PrismaClient } from "@prisma/client";
import { registerSyncPostJob } from "./sync-post.job.js";
import { registerPublishPostJob } from "./publish-post.job.js";
import { registerPollNotionJob } from "./poll-notion.job.js";
import { logger } from "../lib/logger.js";

export async function registerAllJobs(boss: PgBoss, prisma: PrismaClient) {
  await registerSyncPostJob(boss, prisma);
  await registerPublishPostJob(boss, prisma);
  await registerPollNotionJob(boss, prisma);

  logger.info("All job handlers registered");
}
