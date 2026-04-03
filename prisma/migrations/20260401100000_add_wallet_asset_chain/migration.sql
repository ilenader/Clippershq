-- Add wallet asset and chain columns to payout_requests
-- These were in the Prisma schema but missing from the actual database
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "walletAsset" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "walletChain" TEXT;
