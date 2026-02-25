-- AlterTable: add emailVerified to users (existing users default to true)
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true;

-- Future users should default to false
ALTER TABLE "users" ALTER COLUMN "emailVerified" SET DEFAULT false;
