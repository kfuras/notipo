-- Remove unused PostStatus enum values: DRAFT, READY_TO_PUBLISH
-- Neither value is ever assigned in application code.
-- The default is changed from DRAFT to SYNCED.

-- 1. Drop the column default (it references the old enum literal)
ALTER TABLE "posts" ALTER COLUMN "status" DROP DEFAULT;

-- 2. Rename old enum, create new enum without DRAFT and READY_TO_PUBLISH
ALTER TYPE "PostStatus" RENAME TO "PostStatus_old";
CREATE TYPE "PostStatus" AS ENUM ('SYNCED', 'IMAGES_PROCESSING', 'PUBLISHING', 'PUBLISHED', 'UPDATE_PENDING', 'FAILED');

-- 3. Migrate the column to the new enum type
ALTER TABLE "posts" ALTER COLUMN "status" TYPE "PostStatus" USING "status"::text::"PostStatus";

-- 4. Drop the old enum
DROP TYPE "PostStatus_old";

-- 5. Set the new default
ALTER TABLE "posts" ALTER COLUMN "status" SET DEFAULT 'SYNCED'::"PostStatus";
