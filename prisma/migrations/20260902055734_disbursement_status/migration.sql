-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('ACTIVE', 'VOID');

-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "status" "DisbursementStatus" NOT NULL DEFAULT 'ACTIVE';
