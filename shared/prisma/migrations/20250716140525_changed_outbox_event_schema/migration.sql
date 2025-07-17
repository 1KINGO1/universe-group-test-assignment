/*
  Warnings:

  - You are about to drop the column `created_at` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `retry_count` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `sent_at` on the `outbox_events` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `outbox_events` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "outbox_events_created_at_idx";

-- DropIndex
DROP INDEX "outbox_events_status_idx";

-- AlterTable
ALTER TABLE "outbox_events" DROP COLUMN "created_at",
DROP COLUMN "error",
DROP COLUMN "retry_count",
DROP COLUMN "sent_at",
DROP COLUMN "status";

-- DropEnum
DROP TYPE "outbox_status";
