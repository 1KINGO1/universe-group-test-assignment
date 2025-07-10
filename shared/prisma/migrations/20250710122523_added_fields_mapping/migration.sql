/*
  Warnings:

  - You are about to drop the column `createdAt` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `retryCount` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `sentAt` on the `outbox_events` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "outbox_events_createdAt_idx";

-- AlterTable
ALTER TABLE "outbox_events" DROP COLUMN "createdAt",
DROP COLUMN "retryCount",
DROP COLUMN "sentAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events"("created_at");
