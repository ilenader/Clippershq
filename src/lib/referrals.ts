/**
 * Referral system — generates codes, tracks referrals, computes referral earnings.
 */
import { db } from "@/lib/db";
import { DEFAULT_REFERRAL_PERCENT } from "@/lib/earnings-calc";

/** Generate a short unique referral code */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Ensure user has a referral code, create one if not */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  if (!db) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (user?.referralCode) return user.referralCode;

  // Generate unique code
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      await db.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // Collision — retry
    }
  }
  return null;
}

/** Attach a referred user to their inviter (call during signup) */
export async function attachReferral(newUserId: string, referralCode: string): Promise<boolean> {
  if (!db) return false;
  try {
    const inviter = await db.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!inviter || inviter.id === newUserId) return false;

    await db.user.update({ where: { id: newUserId }, data: { referredById: inviter.id } });
    return true;
  } catch { return false; }
}

/** Compute referral earnings for an inviter */
export async function getReferralStats(userId: string) {
  if (!db) return { referralCount: 0, referralEarnings: 0, referrals: [] };

  try {
    const referrals = await db.user.findMany({
      where: { referredById: userId },
      select: { id: true, username: true, name: true, totalEarnings: true, createdAt: true },
    });

    const referralCount = referrals.length;
    const referralPercent = DEFAULT_REFERRAL_PERCENT / 100;
    const referralEarnings = Math.round(
      referrals.reduce((sum: number, r: any) => sum + (r.totalEarnings || 0) * referralPercent, 0) * 100
    ) / 100;

    return { referralCount, referralEarnings, referrals };
  } catch {
    return { referralCount: 0, referralEarnings: 0, referrals: [] };
  }
}
