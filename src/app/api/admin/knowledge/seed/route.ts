import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SEED_DATA = [
  { category: "Clips", question: "How do I submit a clip?", answer: "Go to your campaign, click submit, paste your clip URL, select the platform, submit. The owner will review it." },
  { category: "Earnings", question: "How do earnings work?", answer: "CPM-based. Your views are tracked automatically. Earnings = (views / 1000) × campaign CPM rate. Bonuses from level and streak are added on top." },
  { category: "Earnings", question: "What are the fees?", answer: "9% platform fee deducted from earnings. 4% if you joined via a referral link." },
  { category: "Streaks", question: "What is the streak system?", answer: "Submit at least one approved clip per day across ANY campaign to build your streak. Streak bonuses increase your earnings (up to +10% at 90 days). You have a 48-hour grace period. If all your campaigns are paused, your streak freezes automatically." },
  { category: "Bonus", question: "How do bonuses work?", answer: "Your level, streak, and PWA install bonuses combine into one total bonus percentage. This bonus increases your earnings on every clip. For example, if you have a +10% bonus and earn $100 from views, you'll get $110 before fees." },
  { category: "Bonus", question: "What happens if I lose my streak?", answer: "Your streak bonus resets to 0%. This affects all unpaid earnings — they will recalculate with your new bonus. Already paid out earnings are not affected." },
  { category: "Bonus", question: "How do I increase my bonus?", answer: "Keep your daily posting streak going, level up by earning more, and install the PWA app for an extra +2%. All bonuses stack together." },
  { category: "Payouts", question: "How do I get paid?", answer: "Go to the Payouts page, request a payout with your wallet details. The owner reviews and approves it." },
  { category: "Levels", question: "How do levels work?", answer: "Start at Level 0. Earn $300 total to reach Level 1 (+3% bonus). Higher levels give bigger permanent bonuses up to +20% at Level 5." },
  { category: "Accounts", question: "How do I verify my account?", answer: "Go to My Accounts, add your social media profile link, put the verification code in your bio, click Verify. Make sure your profile is public." },
  { category: "Platform", question: "What platforms are supported?", answer: "TikTok, Instagram, and YouTube." },
  { category: "Campaigns", question: "How do I join a campaign?", answer: "Browse campaigns from the Campaigns page, click Join on one you like. Then start submitting clips for it." },
  { category: "Referrals", question: "What is the referral system?", answer: "Share your referral link from the Referrals page. You earn 5% of your referred clipper's earnings forever. Referred users also get a lower platform fee (4% instead of 9%)." },
  { category: "Campaigns", question: "Can I be in multiple campaigns?", answer: "Yes, you can join and submit clips to multiple campaigns at the same time." },
  { category: "Clips", question: "How long until my clip is approved?", answer: "The owner reviews clips manually, usually within 24 hours." },
  { category: "Clips", question: "Why was my clip rejected?", answer: "Common reasons: wrong platform, duplicate clip, low quality content, wrong campaign, or the clip doesn't meet campaign requirements." },
  { category: "Clips", question: "What is the posting window?", answer: "Clips must be submitted within 2 hours of posting on the platform to be eligible." },
  { category: "Support", question: "How do I contact support?", answer: "Use this chat! If you need a real person, type 'connect me' and someone from the team will help you." },
  { category: "PWA", question: "What is the PWA app?", answer: "Install Clippers HQ on your phone for the best experience and a +2% earnings bonus. Look for the 'Download App' button in the sidebar." },
  { category: "Tracking", question: "How are views tracked?", answer: "Automatically every few hours via our tracking system. Views update in your dashboard after each check." },
  { category: "Earnings", question: "When do earnings update?", answer: "After your clip is approved and views are tracked. Earnings recalculate with each tracking check." },
  { category: "Accounts", question: "What if my verification fails?", answer: "Make sure your profile is public and the verification code is visible in your bio. Wait 30 seconds, then try again. If it still fails, ask an admin to verify manually." },
  { category: "Accounts", question: "How do I change my social account?", answer: "Remove the old account from My Accounts page, then add a new one with the correct link." },
];

export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Only seed if empty
  const count = await db.chatKnowledge.count();
  if (count > 0) {
    return NextResponse.json({ message: `Knowledge base already has ${count} entries. Skipped.`, count });
  }

  await db.chatKnowledge.createMany({ data: SEED_DATA });
  return NextResponse.json({ message: `Seeded ${SEED_DATA.length} entries.`, count: SEED_DATA.length }, { status: 201 });
}
