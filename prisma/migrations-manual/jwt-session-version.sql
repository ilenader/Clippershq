-- jwt-session-version.sql
-- Adds User.sessionVersion column for JWT role-change propagation.
--
-- Background: the NextAuth JWT callback caches role/status on the token and
-- only re-reads from DB every 5 minutes. When OWNER changes a user's role,
-- the target's signed JWT cookie keeps the old role for up to 5 min — too
-- long for an admin promotion flow.
--
-- Fix: store an integer version on each User. The role-change PATCH bumps it
-- atomically with the role update. The JWT callback runs a lightweight
-- single-column lookup every 30 seconds; if the DB version differs from the
-- token's cached version, it triggers a full refresh. Role changes propagate
-- within ~30s; the 5-min full refresh remains as a resilience floor.
--
-- Idempotent. Additive only. No data migration needed — default 0 is safe
-- because tokens minted before deploy will also default to 0 on next refresh
-- and stay in sync until the first real bump.
--
-- Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

COMMIT;
