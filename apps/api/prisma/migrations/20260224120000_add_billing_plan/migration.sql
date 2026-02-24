-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'TRIAL');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT;

-- Set existing tenants to PRO (they had unlimited access before billing)
UPDATE "tenants" SET "plan" = 'PRO';

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripeCustomerId_key" ON "tenants"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripeSubscriptionId_key" ON "tenants"("stripeSubscriptionId");
