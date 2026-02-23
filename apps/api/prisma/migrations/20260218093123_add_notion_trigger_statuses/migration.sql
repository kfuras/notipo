-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "notionPublishTriggerStatus" TEXT NOT NULL DEFAULT 'Publish',
ADD COLUMN     "notionUpdateTriggerStatus" TEXT NOT NULL DEFAULT 'Update Wordpress',
ALTER COLUMN "notionTriggerStatus" SET DEFAULT 'Post to Wordpress';
