/*
  Warnings:

  - Added the required column `requestId` to the `outbox_events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "requestId" TEXT NOT NULL;
