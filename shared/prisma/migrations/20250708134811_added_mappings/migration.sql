/*
  Warnings:

  - You are about to drop the column `eventType` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `funnelStage` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `events` table. All the data in the column will be lost.
  - Added the required column `event_type` to the `events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `funnel_stage` to the `events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_userId_fkey";

-- DropIndex
DROP INDEX "events_eventType_idx";

-- DropIndex
DROP INDEX "events_funnelStage_idx";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "eventType",
DROP COLUMN "funnelStage",
DROP COLUMN "userId",
ADD COLUMN     "event_type" TEXT NOT NULL,
ADD COLUMN     "funnel_stage" "funnel_stages" NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_funnel_stage_idx" ON "events"("funnel_stage");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
