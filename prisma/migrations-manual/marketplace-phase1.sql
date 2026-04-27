-- ─────────────────────────────────────────────────────────────────────────────
-- MARKETPLACE PHASE 1 — manual migration
-- Run in Supabase SQL Editor. Idempotent: uses IF NOT EXISTS where possible.
-- Additive only — no DROP, no RENAME, no destructive ops.
-- See MARKETPLACE_SPEC.md for full design context.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. ENUM types ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MarketplaceListingStatus" AS ENUM (
    'PENDING_APPROVAL', 'ACTIVE', 'PAUSED',
    'DELETION_REQUESTED', 'DELETED', 'REJECTED', 'BANNED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MarketplaceSubmissionStatus" AS ENUM (
    'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'POSTED', 'POST_EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. ALTER existing tables (additive only) ───────────────────────────────
ALTER TABLE "clips"
  ADD COLUMN IF NOT EXISTS "marketplaceSubmissionId" TEXT,
  ADD COLUMN IF NOT EXISTS "isMarketplaceClip" BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. CREATE new tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "marketplace_poster_listings" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "clipAccountId"       TEXT NOT NULL,
  "campaignId"          TEXT NOT NULL,
  "niche"               TEXT NOT NULL,
  "audienceDescription" TEXT NOT NULL,
  "followerCount"       INTEGER NOT NULL,
  "followerOverride"    INTEGER,
  "country"             TEXT,
  "timezone"            TEXT,
  "dailySlotCount"      INTEGER NOT NULL DEFAULT 5,
  "status"              "MarketplaceListingStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "pausedAt"            TIMESTAMP(3),
  "deletionRequestedAt" TIMESTAMP(3),
  "approvedAt"          TIMESTAMP(3),
  "approvedBy"          TEXT,
  "rejectionReason"     TEXT,
  "averageRating"       DOUBLE PRECISION,
  "totalSubmissions"    INTEGER NOT NULL DEFAULT 0,
  "totalApproved"       INTEGER NOT NULL DEFAULT 0,
  "totalPosted"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_poster_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_submissions" (
  "id"              TEXT NOT NULL,
  "creatorId"       TEXT NOT NULL,
  "listingId"       TEXT NOT NULL,
  "driveUrl"        TEXT NOT NULL,
  "videoHash"       TEXT,
  "platforms"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes"           TEXT,
  "status"          "MarketplaceSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "approvedAt"      TIMESTAMP(3),
  "rejectedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "improvementNote" TEXT,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "postDeadline"    TIMESTAMP(3),
  "postedAt"        TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_clip_posts" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "clipId"       TEXT NOT NULL,
  "platform"     TEXT NOT NULL,
  "postedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_clip_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_ratings" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "posterId"     TEXT NOT NULL,
  "creatorId"    TEXT NOT NULL,
  "score"        INTEGER NOT NULL,
  "note"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_ratings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_messages" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "senderId"     TEXT NOT NULL,
  "content"      TEXT NOT NULL,
  "readAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_strikes" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "reason"       TEXT NOT NULL,
  "submissionId" TEXT,
  "bannedUntil"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_strikes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_video_hashes" (
  "id"                    TEXT NOT NULL,
  "hash"                  TEXT NOT NULL,
  "firstSeenSubmissionId" TEXT NOT NULL,
  "rejectionCount"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_video_hashes_pkey" PRIMARY KEY ("id")
);

-- ─── 4. UNIQUE indexes ──────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_poster_listings_userId_clipAccountId_campaignId_key"
  ON "marketplace_poster_listings"("userId", "clipAccountId", "campaignId");

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_clip_posts_clipId_key"
  ON "marketplace_clip_posts"("clipId");

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_ratings_submissionId_key"
  ON "marketplace_ratings"("submissionId");

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_video_hashes_hash_key"
  ON "marketplace_video_hashes"("hash");

-- ─── 5. Non-unique indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "marketplace_poster_listings_campaignId_status_idx"
  ON "marketplace_poster_listings"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "marketplace_poster_listings_userId_idx"
  ON "marketplace_poster_listings"("userId");

CREATE INDEX IF NOT EXISTS "marketplace_submissions_listingId_status_idx"
  ON "marketplace_submissions"("listingId", "status");
CREATE INDEX IF NOT EXISTS "marketplace_submissions_creatorId_status_idx"
  ON "marketplace_submissions"("creatorId", "status");
CREATE INDEX IF NOT EXISTS "marketplace_submissions_videoHash_idx"
  ON "marketplace_submissions"("videoHash");
CREATE INDEX IF NOT EXISTS "marketplace_submissions_expiresAt_idx"
  ON "marketplace_submissions"("expiresAt");
CREATE INDEX IF NOT EXISTS "marketplace_submissions_postDeadline_idx"
  ON "marketplace_submissions"("postDeadline");

CREATE INDEX IF NOT EXISTS "marketplace_clip_posts_submissionId_idx"
  ON "marketplace_clip_posts"("submissionId");

CREATE INDEX IF NOT EXISTS "marketplace_ratings_creatorId_idx"
  ON "marketplace_ratings"("creatorId");
CREATE INDEX IF NOT EXISTS "marketplace_ratings_posterId_idx"
  ON "marketplace_ratings"("posterId");

CREATE INDEX IF NOT EXISTS "marketplace_messages_submissionId_createdAt_idx"
  ON "marketplace_messages"("submissionId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_messages_senderId_idx"
  ON "marketplace_messages"("senderId");

CREATE INDEX IF NOT EXISTS "marketplace_strikes_userId_createdAt_idx"
  ON "marketplace_strikes"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "marketplace_video_hashes_hash_idx"
  ON "marketplace_video_hashes"("hash");

-- ─── 6. FOREIGN KEY constraints ─────────────────────────────────────────────
-- All FKs use the codebase convention: <table>_<column>_fkey
-- Wrapped in DO blocks so re-running is safe (skips if already present).

DO $$ BEGIN
  ALTER TABLE "marketplace_poster_listings"
    ADD CONSTRAINT "marketplace_poster_listings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_poster_listings"
    ADD CONSTRAINT "marketplace_poster_listings_clipAccountId_fkey"
    FOREIGN KEY ("clipAccountId") REFERENCES "clip_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_poster_listings"
    ADD CONSTRAINT "marketplace_poster_listings_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_submissions"
    ADD CONSTRAINT "marketplace_submissions_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_submissions"
    ADD CONSTRAINT "marketplace_submissions_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "marketplace_poster_listings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_clip_posts"
    ADD CONSTRAINT "marketplace_clip_posts_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "marketplace_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_clip_posts"
    ADD CONSTRAINT "marketplace_clip_posts_clipId_fkey"
    FOREIGN KEY ("clipId") REFERENCES "clips"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_ratings"
    ADD CONSTRAINT "marketplace_ratings_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "marketplace_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_ratings"
    ADD CONSTRAINT "marketplace_ratings_posterId_fkey"
    FOREIGN KEY ("posterId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_ratings"
    ADD CONSTRAINT "marketplace_ratings_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "marketplace_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_strikes"
    ADD CONSTRAINT "marketplace_strikes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
