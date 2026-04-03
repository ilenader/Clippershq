-- Baseline drift sync: captures all changes applied directly to DB
-- that were not tracked in prior migrations.
-- This migration is marked as "already applied" — it does NOT execute,
-- it only records that the DB already has these changes.

-- Campaigns: add dual monetization columns
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "monetizationType" TEXT DEFAULT 'CPM';
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "clipperCpm" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ownerCpm" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "agencyFee" DOUBLE PRECISION;

-- Users: add gamification columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totalEarnings" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totalViews" INTEGER DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "level" INTEGER DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bonusPercentage" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "currentStreak" INTEGER DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "longestStreak" INTEGER DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActiveDate" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manualBonusOverride" DOUBLE PRECISION;

-- Users: unique + FK constraints
CREATE UNIQUE INDEX IF NOT EXISTS "users_referralCode_key" ON "users"("referralCode");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referredById_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Conversations
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "conversations_updatedAt_idx" ON "conversations"("updatedAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_campaignId_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Conversation Participants
CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_conversationId_userId_key" ON "conversation_participants"("conversationId", "userId");
CREATE INDEX IF NOT EXISTS "conversation_participants_userId_idx" ON "conversation_participants"("userId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_conversationId_fkey') THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_userId_fkey') THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Messages
CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_conversationId_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_senderId_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Notifications
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx" ON "notifications"("createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_userId_fkey') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Gamification Config
CREATE TABLE IF NOT EXISTS "gamification_config" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "gamification_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gamification_config_key_key" ON "gamification_config"("key");
