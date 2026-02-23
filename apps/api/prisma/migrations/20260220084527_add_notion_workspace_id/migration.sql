-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "notionWorkspaceId" TEXT;

-- CreateIndex
CREATE INDEX "tenants_notionWorkspaceId_idx" ON "tenants"("notionWorkspaceId");
