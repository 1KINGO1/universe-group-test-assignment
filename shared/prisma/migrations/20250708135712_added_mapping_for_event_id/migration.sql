/*
  Warnings:

  - You are about to drop the column `eventId` on the `events` table. All the data in the column will be lost.
  - Added the required column `event_id` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "events" DROP COLUMN "eventId",
ADD COLUMN     "event_id" TEXT NOT NULL;
