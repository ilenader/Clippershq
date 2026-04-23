import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/campaigns/past-create — OWNER-only.
 *
 * Creates a `status: PAST` campaign tile for the /campaigns bottom strip. These
 * are marketing-only display cards — no clips, no community channels, no
 * tracking jobs, no Discord broadcast. Every schema-required side effect the
 * normal POST /api/campaigns triggers is intentionally skipped here.
 *
 * Distinct from the normal create endpoint so a careless edit to campaign
 * creation logic doesn't accidentally start spinning up tracking + community
 * for a display-only tile.
 *
 * PATCH supports editing the same tiles; DELETE archives (isArchived=true).
 */

function parsePositive(v: any, field: string): { value: number | null; error: string | null } {
  if (v === "" || v === null || v === undefined) return { value: null, error: null };
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!isFinite(n) || n < 0) return { value: null, error: `${field} must be a non-negative number` };
  return { value: n, error: null };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const platform = typeof data.platform === "string" ? data.platform.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "Name is required (max 200 chars)" }, { status: 400 });
  if (!platform) return NextResponse.json({ error: "Platform is required" }, { status: 400 });

  const clientName = typeof data.clientName === "string" ? data.clientName.trim().slice(0, 200) : null;
  const cardImageUrl = typeof data.cardImageUrl === "string" ? data.cardImageUrl.trim().slice(0, 2000) : null;

  // Numeric fields — all required per spec but we also guard against bad input.
  const budgetP = parsePositive(data.budget, "Budget");
  const spentP = parsePositive(data.manualSpent, "Spent");
  const minViewsP = parsePositive(data.minViews, "Min views");
  const cpmP = parsePositive(data.clipperCpm, "Clipper CPM");
  const maxPayP = parsePositive(data.maxPayoutPerClip, "Max payout per clip");
  const maxClipsP = parsePositive(data.maxClipsPerUserPerDay, "Daily clip limit");
  for (const p of [budgetP, spentP, minViewsP, cpmP, maxPayP, maxClipsP]) {
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });
  }
  if (budgetP.value != null && spentP.value != null && spentP.value > budgetP.value) {
    return NextResponse.json({ error: "Spent cannot exceed budget" }, { status: 400 });
  }

  try {
    const campaign = await db.campaign.create({
      data: {
        name,
        platform,
        status: "PAST",
        pricingModel: "CPM_SPLIT",
        clientName,
        cardImageUrl,
        imageUrl: cardImageUrl, // legacy fallback so any old card reader still shows the image
        budget: budgetP.value,
        manualSpent: spentP.value,
        minViews: minViewsP.value != null ? Math.round(minViewsP.value) : null,
        clipperCpm: cpmP.value,
        maxPayoutPerClip: maxPayP.value,
        maxClipsPerUserPerDay: maxClipsP.value != null ? Math.max(1, Math.round(maxClipsP.value)) : 3,
        ownerCpm: 0,
        payoutRule: "-",
        description: "Past campaign — display only",
        requirements: "",
        startDate: new Date(),
        createdById: session.user.id,
        ownerUserId: session.user.id,
        announceOnDiscord: false,
      },
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (err: any) {
    console.error("[PAST-CREATE] failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to create past campaign" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = typeof data.id === "string" ? data.id : null;
  if (!id) return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });

  const existing = await db.campaign.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "PAST") {
    return NextResponse.json({ error: "This endpoint only edits PAST campaigns" }, { status: 400 });
  }

  const updateData: Record<string, any> = {};
  if (typeof data.name === "string" && data.name.trim()) updateData.name = data.name.trim().slice(0, 200);
  if (typeof data.platform === "string" && data.platform.trim()) updateData.platform = data.platform.trim();
  if (typeof data.clientName === "string" || data.clientName === null) {
    updateData.clientName = data.clientName ? String(data.clientName).trim().slice(0, 200) : null;
  }
  if (typeof data.cardImageUrl === "string" || data.cardImageUrl === null) {
    const url = data.cardImageUrl ? String(data.cardImageUrl).trim().slice(0, 2000) : null;
    updateData.cardImageUrl = url;
    updateData.imageUrl = url;
  }

  const numericFields: [string, string][] = [
    ["budget", "Budget"],
    ["manualSpent", "Spent"],
    ["minViews", "Min views"],
    ["clipperCpm", "Clipper CPM"],
    ["maxPayoutPerClip", "Max payout per clip"],
    ["maxClipsPerUserPerDay", "Daily clip limit"],
  ];
  for (const [field, label] of numericFields) {
    if (data[field] === undefined) continue;
    const p = parsePositive(data[field], label);
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });
    if (field === "minViews" || field === "maxClipsPerUserPerDay") {
      updateData[field] = p.value != null ? Math.max(field === "maxClipsPerUserPerDay" ? 1 : 0, Math.round(p.value)) : null;
    } else {
      updateData[field] = p.value;
    }
  }

  if (updateData.budget != null && updateData.manualSpent != null && updateData.manualSpent > updateData.budget) {
    return NextResponse.json({ error: "Spent cannot exceed budget" }, { status: 400 });
  }

  try {
    const updated = await db.campaign.update({ where: { id }, data: updateData });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("[PAST-CREATE PATCH] failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to update past campaign" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });

  const existing = await db.campaign.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "PAST") {
    return NextResponse.json({ error: "This endpoint only deletes PAST campaigns" }, { status: 400 });
  }

  try {
    // Soft-delete via isArchived so a mistaken delete can be reversed straight
    // from the DB. Archived past campaigns drop out of both /api/campaigns/past
    // and the admin list.
    await db.campaign.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date(), archivedById: session.user.id },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PAST-CREATE DELETE] failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to delete past campaign" }, { status: 500 });
  }
}

// GET returns all PAST non-archived campaigns for the admin management table.
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json([]);

  try {
    const rows = await db.campaign.findMany({
      where: { status: "PAST", isArchived: false },
      select: {
        id: true,
        name: true,
        platform: true,
        clientName: true,
        cardImageUrl: true,
        budget: true,
        manualSpent: true,
        minViews: true,
        clipperCpm: true,
        maxPayoutPerClip: true,
        maxClipsPerUserPerDay: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}
