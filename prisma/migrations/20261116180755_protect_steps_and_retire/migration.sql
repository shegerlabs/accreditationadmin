-- AlterEnum
ALTER TYPE "Action" ADD VALUE 'MOVE';

-- DropForeignKey
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_stepId_fkey";

-- DropForeignKey
ALTER TABLE "Participant" DROP CONSTRAINT "Participant_stepId_fkey";

-- AlterTable
ALTER TABLE "Step" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
