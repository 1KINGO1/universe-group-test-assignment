/*
  Warnings:

  - You are about to drop the column `requestId` on the `outbox_events` table. All the data in the column will be lost.
  - Added the required column `request_id` to the `outbox_events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "outbox_events" DROP COLUMN "requestId",
ADD COLUMN     "request_id" TEXT NOT NULL;
