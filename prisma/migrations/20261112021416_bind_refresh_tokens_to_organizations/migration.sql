/*
  Warnings:

  - Added the required column `organizationId` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RefreshToken"
ADD COLUMN "organizationId" UUID;

UPDATE "RefreshToken" AS rt
SET "organizationId" = (
  SELECT om."organizationId"
  FROM "OrganizationMember" AS om
  WHERE om."userId" = rt."userId"
  ORDER BY om."createdAt" ASC
  LIMIT 1
);

DELETE FROM "RefreshToken"
WHERE "organizationId" IS NULL;

ALTER TABLE "RefreshToken"
ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX "RefreshToken_organizationId_idx"
ON "RefreshToken"("organizationId");

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;