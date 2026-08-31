-- AlterTable
ALTER TABLE "Contribution" ADD COLUMN     "caseId" TEXT;

-- CreateIndex
CREATE INDEX "Contribution_caseId_idx" ON "Contribution"("caseId");

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
