-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('MONTHLY', 'YEARLY', 'ONCE');

-- AlterEnum
-- Replace CaseStatus values (PROPOSED/APPROVED/DISBURSED/CLOSED) with
-- (ACTIVE/CLOSED/CANCELLED). There are zero rows in the Case table in both
-- dev and prod at the time of this migration, so a bare USING cast is safe
-- even though the old and new enum labels only partially overlap (CLOSED).
BEGIN;
CREATE TYPE "CaseStatus_new" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');
ALTER TABLE "Case" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Case" ALTER COLUMN "status" TYPE "CaseStatus_new" USING ("status"::text::"CaseStatus_new");
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
ALTER TYPE "CaseStatus_new" RENAME TO "CaseStatus";
DROP TYPE "CaseStatus_old";
ALTER TABLE "Case" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "type" "CaseType" NOT NULL DEFAULT 'ONCE';
