-- marketplace-ratings-bidirectional.sql
-- Phase 7a — bidirectional marketplace ratings.
--
-- Background: the original MarketplaceRating model only allowed one rating per
-- submission via @unique(submissionId). Phase 7a unlocks both directions —
-- poster rates creator AND creator rates poster — via a `direction` enum +
-- composite unique on (submissionId, direction). Adds cached reputation
-- columns on User (per-direction) and a ratingCount on MarketplacePosterListing
-- so card UIs don't need a GROUP BY per render.
--
-- Idempotent. Additive only. No data migration needed:
--   - new direction column defaults to 'POSTER_RATES_CREATOR' so any rows
--     written before the API gate flips remain semantically valid (the
--     original schema modeled poster→creator only).
--   - new cache columns default to NULL/0; the rating-insert API recomputes
--     fresh aggregates atomically per insert, so caches converge naturally
--     once the first rating after deploy lands. No backfill script required.
--
-- Run in Supabase SQL Editor.

BEGIN;

-- 1) Direction enum. CREATE TYPE has no IF NOT EXISTS in Postgres, so guard
--    with a DO block that swallows the duplicate_object error if rerun.
DO $$
BEGIN
  CREATE TYPE "MarketplaceRatingDirection" AS ENUM (
    'POSTER_RATES_CREATOR',
    'CREATOR_RATES_POSTER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2) Add direction column to existing ratings table. Default ensures any
--    pre-existing rows backfill safely as the legacy direction.
ALTER TABLE "marketplace_ratings"
  ADD COLUMN IF NOT EXISTS "direction" "MarketplaceRatingDirection"
  NOT NULL DEFAULT 'POSTER_RATES_CREATOR';

-- 3) Drop the old single-direction unique constraint.
ALTER TABLE "marketplace_ratings"
  DROP CONSTRAINT IF EXISTS "marketplace_ratings_submissionId_key";

-- 4) Add composite unique (submissionId, direction). One rating per direction
--    per submission — max 2 rows per submission. Wrapped in DO/EXCEPTION
--    because ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS form pre-PG17;
--    the duplicate_object guard makes the migration idempotent on rerun.
DO $$
BEGIN
  ALTER TABLE "marketplace_ratings"
    ADD CONSTRAINT "marketplace_ratings_submissionId_direction_key"
    UNIQUE ("submissionId", "direction");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 5) Cached reputation columns on users. NULL avg + 0 count is the natural
--    "no ratings yet" state — UI hides the badge below count=0 (Q13).
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "marketplaceAvgAsPoster" DOUBLE PRECISION;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "marketplaceCountAsPoster" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "marketplaceAvgAsCreator" DOUBLE PRECISION;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "marketplaceCountAsCreator" INTEGER NOT NULL DEFAULT 0;

-- 6) ratingCount on listings. Pairs with the existing averageRating column
--    so the browse-card "★ 4.7 (12)" display is one read.
ALTER TABLE "marketplace_poster_listings"
  ADD COLUMN IF NOT EXISTS "ratingCount" INTEGER NOT NULL DEFAULT 0;

COMMIT;
