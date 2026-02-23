-- Remove notionPollIntervalSec from tenants.
-- The poll interval is hardcoded to 15s globally; this field was never used at runtime.
ALTER TABLE "tenants" DROP COLUMN "notionPollIntervalSec";
