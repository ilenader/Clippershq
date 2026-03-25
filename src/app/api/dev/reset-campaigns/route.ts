import { db } from "@/lib/db";
import { NextResponse } from "next/server";

async function truncate(table: string): Promise<string> {
  try {
    await db.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    return `${table}: cleared`;
  } catch {
    return `${table}: skipped`;
  }
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  // Try every possible table name — will silently skip if not found
  const results = [];
  results.push(await truncate("clip_stats"));
  results.push(await truncate("clips"));
  results.push(await truncate("payout_requests"));
  results.push(await truncate("notes"));
  results.push(await truncate("campaign_accounts"));
  results.push(await truncate("campaign_admins"));
  results.push(await truncate("pending_campaign_edits"));
  results.push(await truncate("campaigns"));

  let campaignsLeft = -1;
  let clipsLeft = -1;
  try { campaignsLeft = await db.campaign.count(); } catch {}
  try { clipsLeft = await db.clip.count(); } catch {}

  return NextResponse.json({ success: true, campaignsLeft, clipsLeft, results });
}
