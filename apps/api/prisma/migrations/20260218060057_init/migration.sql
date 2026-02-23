-- CreateEnum
CREATE TYPE "CodeHighlighter" AS ENUM ('PRISMATIC', 'WP_CODE', 'HIGHLIGHT_JS', 'PRISM_JS');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SYNCED', 'IMAGES_PROCESSING', 'READY_TO_PUBLISH', 'PUBLISHING', 'PUBLISHED', 'UPDATE_PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('NOTION_POLL', 'SYNC_POST', 'PROCESS_IMAGES', 'GENERATE_FEATURED_IMAGE', 'PUBLISH_POST', 'UPDATE_POST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notionCredentials" TEXT,
    "wordpressCredentials" TEXT,
    "notionDatabaseId" TEXT,
    "notionPollIntervalSec" INTEGER NOT NULL DEFAULT 60,
    "notionTriggerStatus" TEXT NOT NULL DEFAULT 'Ready to Publish',
    "wpSiteUrl" TEXT,
    "codeHighlighter" "CodeHighlighter" NOT NULL DEFAULT 'PRISMATIC',

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "apiKey" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notionPageId" TEXT,
    "notionLastEdit" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "markdownContent" TEXT,
    "wpContent" TEXT,
    "excerpt" TEXT,
    "wpPostId" INTEGER,
    "wpUrl" TEXT,
    "seoKeyword" TEXT,
    "seoDescription" TEXT,
    "categoryId" TEXT,
    "tags" TEXT[],
    "featuredImageTitle" TEXT,
    "featuredImageUrl" TEXT,
    "wpFeaturedMediaId" INTEGER,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "syncedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wpCategoryId" INTEGER,
    "wpTagIds" INTEGER[],
    "backgroundImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notionImageUrl" TEXT NOT NULL,
    "wpImageUrl" TEXT NOT NULL,
    "wpMediaId" INTEGER NOT NULL,
    "filename" TEXT,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "postId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "pgBossJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_apiKey_key" ON "users"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_tenantId_key" ON "users"("email", "tenantId");

-- CreateIndex
CREATE INDEX "posts_tenantId_status_idx" ON "posts"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "posts_tenantId_notionPageId_key" ON "posts"("tenantId", "notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_name_key" ON "categories"("tenantId", "name");

-- CreateIndex
CREATE INDEX "image_mappings_tenantId_postId_idx" ON "image_mappings"("tenantId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "image_mappings_tenantId_notionImageUrl_key" ON "image_mappings"("tenantId", "notionImageUrl");

-- CreateIndex
CREATE INDEX "jobs_tenantId_status_idx" ON "jobs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_mappings" ADD CONSTRAINT "image_mappings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_mappings" ADD CONSTRAINT "image_mappings_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
