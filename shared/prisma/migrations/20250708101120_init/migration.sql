-- CreateEnum
CREATE TYPE "sources" AS ENUM ('facebook', 'tiktok');

-- CreateEnum
CREATE TYPE "funnel_stages" AS ENUM ('top', 'bottom');

-- CreateEnum
CREATE TYPE "genders" AS ENUM ('male', 'female', 'non_binary');

-- CreateEnum
CREATE TYPE "services" AS ENUM ('gateway', 'fb_collector', 'ttk_collector', 'reporter');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('accepted', 'processed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "source" "sources" NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "age" INTEGER,
    "gender" "genders",
    "country" TEXT,
    "city" TEXT,
    "username" TEXT,
    "followers" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "funnelStage" "funnel_stages" NOT NULL,
    "source" "sources" NOT NULL,
    "data" JSONB NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_source_user_id_key" ON "users"("source", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_eventId_key" ON "events"("eventId");

-- CreateIndex
CREATE INDEX "events_timestamp_idx" ON "events"("timestamp");

-- CreateIndex
CREATE INDEX "events_eventType_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX "events_funnelStage_idx" ON "events"("funnelStage");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
