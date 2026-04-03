-- Add payout fee/bonus breakdown fields
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "feePercent" DOUBLE PRECISION;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "bonusPercent" DOUBLE PRECISION;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "feeAmount" DOUBLE PRECISION;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "bonusAmount" DOUBLE PRECISION;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "finalAmount" DOUBLE PRECISION;
