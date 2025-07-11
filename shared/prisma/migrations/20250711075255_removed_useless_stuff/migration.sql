/*
  Warnings:

  - You are about to drop the column `eventType` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `outbox_events` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "outbox_events" DROP COLUMN "eventType",
DROP COLUMN "source";

-- DropEnum
DROP TYPE "event_status";

-- DropEnum
DROP TYPE "services";
