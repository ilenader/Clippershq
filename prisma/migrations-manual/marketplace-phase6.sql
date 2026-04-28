-- ─────────────────────────────────────────────────────────────────────────────
-- MARKETPLACE PHASE 6 — manual migration
-- 60/30/10 earnings split: creator (60%), poster (30%), platform (10%).
--
-- Clip.earnings holds the poster's 30% share (existing payout/balance flows
-- unchanged). Creator's 60% lives in marketplace_creator_earnings, joined to
-- users via creatorId. Platform's 10% lives in marketplace_platform_earnings
-- and is never returned in user-facing API responses.
--
-- Run in Supabase SQL Editor. Idempotent: uses IF NOT EXISTS where possible.
-- Additive only — no DROP, no RENAME, no destructive ops, no Clip column changes.
-- See MARKETPLACE_SPEC.md for full design context.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. CREATE new tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "marketplace_creator_earnings" (
  "id"                           TEXT NOT NULL,
  "clipId"                       TEXT NOT NULL,
  "creatorId"                    TEXT NOT NULL,
  "campaignId"                   TEXT NOT NULL,
  "amount"                       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "baseAmount"                   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bonusPercent"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bonusAmount"                  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "streakBonusPercentAtApproval" DOUBLE PRECISION,
  "savedAmount"                  DOUBLE PRECISION,
  "views"                        INTEGER NOT NULL DEFAULT 0,
  "createdAt"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_creator_earnings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "marketplace_platform_earnings" (
  "id"          TEXT NOT NULL,
  "clipId"      TEXT NOT NULL,
  "campaignId"  TEXT NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "savedAmount" DOUBLE PRECISION,
  "views"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_platform_earnings_pkey" PRIMARY KEY ("id")
);

-- ─── 2. UNIQUE indexes ──────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_creator_earnings_clipId_key"
  ON "marketplace_creator_earnings"("clipId");

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_platform_earnings_clipId_key"
  ON "marketplace_platform_earnings"("clipId");

-- ─── 3. Non-unique indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "marketplace_creator_earnings_clipId_idx"
  ON "marketplace_creator_earnings"("clipId");
CREATE INDEX IF NOT EXISTS "marketplace_creator_earnings_creatorId_idx"
  ON "marketplace_creator_earnings"("creatorId");
CREATE INDEX IF NOT EXISTS "marketplace_creator_earnings_campaignId_idx"
  ON "marketplace_creator_earnings"("campaignId");

CREATE INDEX IF NOT EXISTS "marketplace_platform_earnings_clipId_idx"
  ON "marketplace_platform_earnings"("clipId");
CREATE INDEX IF NOT EXISTS "marketplace_platform_earnings_campaignId_idx"
  ON "marketplace_platform_earnings"("campaignId");

-- ─── 4. FOREIGN KEY constraints ─────────────────────────────────────────────
-- All FKs use the codebase convention: <table>_<column>_fkey
-- Wrapped in DO blocks so re-running is safe (skips if already present).

DO $$ BEGIN
  ALTER TABLE "marketplace_creator_earnings"
    ADD CONSTRAINT "marketplace_creator_earnings_clipId_fkey"
    FOREIGN KEY ("clipId") REFERENCES "clips"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_creator_earnings"
    ADD CONSTRAINT "marketplace_creator_earnings_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_creator_earnings"
    ADD CONSTRAINT "marketplace_creator_earnings_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_platform_earnings"
    ADD CONSTRAINT "marketplace_platform_earnings_clipId_fkey"
    FOREIGN KEY ("clipId") REFERENCES "clips"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_platform_earnings"
    ADD CONSTRAINT "marketplace_platform_earnings_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
