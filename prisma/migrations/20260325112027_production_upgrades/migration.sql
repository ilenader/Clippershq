-- AlterTable
ALTER TABLE "clip_stats" ADD COLUMN     "isManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "clips" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "payout_requests" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trustScore" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_campaigns" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "team_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_jobs" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "nextCheckAt" TIMESTAMP(3) NOT NULL,
    "checkIntervalMin" INTEGER NOT NULL DEFAULT 120,
    "consecutiveFlats" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_campaigns_teamId_campaignId_key" ON "team_campaigns"("teamId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_jobs_clipId_key" ON "tracking_jobs"("clipId");

-- CreateIndex
CREATE INDEX "tracking_jobs_isActive_nextCheckAt_idx" ON "tracking_jobs"("isActive", "nextCheckAt");

-- CreateIndex
CREATE INDEX "tracking_jobs_campaignId_idx" ON "tracking_jobs"("campaignId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "campaign_admins_userId_idx" ON "campaign_admins"("userId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_isArchived_idx" ON "campaigns"("isArchived");

-- CreateIndex
CREATE INDEX "campaigns_createdById_idx" ON "campaigns"("createdById");

-- CreateIndex
CREATE INDEX "clip_accounts_userId_idx" ON "clip_accounts"("userId");

-- CreateIndex
CREATE INDEX "clip_stats_clipId_idx" ON "clip_stats"("clipId");

-- CreateIndex
CREATE INDEX "clips_userId_idx" ON "clips"("userId");

-- CreateIndex
CREATE INDEX "clips_campaignId_idx" ON "clips"("campaignId");

-- CreateIndex
CREATE INDEX "clips_status_idx" ON "clips"("status");

-- CreateIndex
CREATE INDEX "payout_requests_userId_idx" ON "payout_requests"("userId");

-- CreateIndex
CREATE INDEX "payout_requests_status_idx" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "payout_requests_campaignId_idx" ON "payout_requests"("campaignId");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_campaigns" ADD CONSTRAINT "team_campaigns_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_campaigns" ADD CONSTRAINT "team_campaigns_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_jobs" ADD CONSTRAINT "tracking_jobs_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "clips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_jobs" ADD CONSTRAINT "tracking_jobs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
