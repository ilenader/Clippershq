import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ACCENT = "2596be";
const HEADER_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT}` } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
const ALT_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FA" } };
const GRAY_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE0E0E0" } },
  bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
  left: { style: "thin", color: { argb: "FFE0E0E0" } },
  right: { style: "thin", color: { argb: "FFE0E0E0" } },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 25;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function styleDataRow(row: ExcelJS.Row, idx: number) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
    cell.font = { name: "Calibri", size: 10 };
    if (idx % 2 === 1) cell.fill = ALT_FILL;
  });
}

function autoWidth(sheet: ExcelJS.Worksheet, minWidths?: Record<number, number>) {
  sheet.columns.forEach((col, i) => {
    const min = minWidths?.[i + 1] || 10;
    let max = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length + 2;
      if (len > max) max = len;
    });
    col.width = Math.min(max, 50);
  });
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toISOString().replace("T", " ").substring(0, 16);
}

/**
 * Sanitize a string cell value so Excel doesn't interpret it as a formula.
 * Any cell starting with =, +, -, @, TAB, CR, LF can become a formula (RCE/phishing).
 * Prefixing with ' makes Excel render it as plain text.
 */
function safe(val: any): any {
  if (typeof val !== "string" || val.length === 0) return val;
  const first = val[0];
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r" || first === "\n") {
    return "'" + val;
  }
  return val;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const rl = checkRateLimit(`export:${session.user.id}`, 10, 60 * 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "owner";
    const campaignId = url.searchParams.get("campaignId");
    const timeframe = parseInt(url.searchParams.get("timeframe") || "0");

    if (view === "client" && !campaignId) {
      return NextResponse.json({ error: "campaignId is required for client view" }, { status: 400 });
    }

    // Build clip query
    const clipWhere: any = { isDeleted: false };
    if (campaignId) clipWhere.campaignId = campaignId;
    if (timeframe > 0) {
      const since = new Date();
      since.setDate(since.getDate() - timeframe);
      clipWhere.createdAt = { gte: since };
    }

    const clips = await db.clip.findMany({
      where: clipWhere,
      include: {
        user: { select: { id: true, name: true, username: true, email: true, level: true, currentStreak: true, referredById: true, isPWAUser: true } },
        campaign: { select: { id: true, name: true, platform: true, status: true, budget: true, clipperCpm: true, ownerCpm: true, cpmRate: true, createdAt: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
        agencyEarning: { select: { amount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const campaigns = await db.campaign.findMany({
      where: campaignId ? { id: campaignId } : {},
      select: { id: true, name: true, platform: true, status: true, budget: true, clipperCpm: true, ownerCpm: true, cpmRate: true, createdAt: true, startDate: true },
      take: 500,
    });

    // Spend per campaign
    const spendMap: Record<string, { clipper: number; owner: number }> = {};
    for (const clip of clips) {
      if (clip.status !== "APPROVED" || clip.videoUnavailable) continue;
      const cid = clip.campaignId;
      if (!spendMap[cid]) spendMap[cid] = { clipper: 0, owner: 0 };
      spendMap[cid].clipper += clip.earnings || 0;
      spendMap[cid].owner += clip.agencyEarning?.amount || 0;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Clippers HQ";
    workbook.created = new Date();

    if (view === "client") {
      await buildClientWorkbook(workbook, clips, campaigns, campaignId!, timeframe);
    } else {
      await buildOwnerWorkbook(workbook, clips, campaigns, spendMap, campaignId, timeframe);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `clippers-hq-${view}-report-${dateStr}.xlsx`;

    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.xlsx",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[EXPORT] Error:", err?.message);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

// ─── OWNER WORKBOOK ────────────────────────────────────────

async function buildOwnerWorkbook(
  wb: ExcelJS.Workbook,
  clips: any[],
  campaigns: any[],
  spendMap: Record<string, { clipper: number; owner: number }>,
  campaignId: string | null,
  timeframe: number,
) {
  const campaignName = campaignId
    ? campaigns.find((c) => c.id === campaignId)?.name || "Unknown"
    : "All Campaigns";

  // ── Sheet 1: Overview ──
  const ov = wb.addWorksheet("Overview");
  ov.getCell("A1").value = "CLIPPERS HQ";
  ov.getCell("A1").font = { bold: true, size: 18, color: { argb: `FF${ACCENT}` }, name: "Calibri" };
  ov.getCell("A2").value = `Export Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  ov.getCell("A3").value = `Campaign: ${campaignName}`;
  ov.getCell("A4").value = `Timeframe: ${timeframe > 0 ? `${timeframe} days` : "All Time"}`;

  const approved = clips.filter((c) => c.status === "APPROVED" && !c.videoUnavailable);
  const pending = clips.filter((c) => c.status === "PENDING");
  const rejected = clips.filter((c) => c.status === "REJECTED");
  const totalViews = clips.reduce((s, c) => s + (c.stats?.[0]?.views || 0), 0);
  const totalClipperEarnings = approved.reduce((s, c) => s + (c.earnings || 0), 0);
  const totalOwnerEarnings = approved.reduce((s, c) => s + (c.agencyEarning?.amount || 0), 0);
  const totalFee = Math.round(totalClipperEarnings * 0.09 * 100) / 100;
  const totalBudget = campaigns.reduce((s, c) => s + (c.budget || 0), 0);
  const totalSpent = Object.values(spendMap).reduce((s, v) => s + v.clipper + v.owner, 0);
  const uniqueClippers = new Set(clips.map((c) => c.userId).filter(Boolean));

  const summaryRows = [
    ["Total Clips", clips.length],
    ["Approved Clips", approved.length],
    ["Pending Clips", pending.length],
    ["Rejected Clips", rejected.length],
    ["Total Views", totalViews],
    ["Total Earnings (Clipper)", totalClipperEarnings],
    ["Total Owner Earnings", totalOwnerEarnings],
    ["Total Agency Fee", totalFee],
    ["Budget Used", totalSpent],
    ["Budget Remaining", Math.max(totalBudget - totalSpent, 0)],
    ["Active Clippers", uniqueClippers.size],
  ];

  let row = 6;
  for (const [label, val] of summaryRows) {
    const r = ov.getRow(row);
    r.getCell(1).value = label as string;
    r.getCell(1).font = { bold: true, name: "Calibri", size: 11 };
    r.getCell(1).fill = GRAY_FILL;
    r.getCell(1).border = THIN_BORDER;
    r.getCell(2).value = typeof val === "number" ? val : val;
    r.getCell(2).alignment = { horizontal: "right" };
    r.getCell(2).border = THIN_BORDER;
    if (typeof val === "number" && String(label).includes("Earnings") || String(label).includes("Fee") || String(label).includes("Budget") || String(label).includes("Remaining") || String(label).includes("Used")) {
      r.getCell(2).numFmt = "#,##0.00";
    } else if (typeof val === "number") {
      r.getCell(2).numFmt = "#,##0";
    }
    row++;
  }
  ov.getColumn(1).width = 25;
  ov.getColumn(2).width = 20;

  // ── Sheet 2: Clips Detail ──
  const cd = wb.addWorksheet("Clips Detail");
  const clipHeaders = ["Clip ID", "Clipper", "Campaign", "Platform", "URL", "Status", "Views", "Likes", "Comments", "Shares", "Base Earnings", "Bonus %", "Bonus Amount", "Total Earnings", "Owner Earnings", "Fee %", "Fraud Score", "Video Available", "Submitted", "Reviewed"];
  const headerRow = cd.addRow(clipHeaders);
  styleHeaderRow(headerRow);
  cd.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

  clips.forEach((clip, i) => {
    const stat = clip.stats?.[0];
    const r = cd.addRow([
      clip.id,
      safe(clip.user?.username || clip.user?.name || "Unknown"),
      safe(clip.campaign?.name || ""),
      safe(clip.campaign?.platform || ""),
      safe(clip.clipUrl || ""),
      clip.status,
      stat?.views || 0,
      stat?.likes || 0,
      stat?.comments || 0,
      stat?.shares || 0,
      clip.baseEarnings || 0,
      clip.bonusPercent || 0,
      clip.bonusAmount || 0,
      clip.earnings || 0,
      clip.agencyEarning?.amount || 0,
      clip.feePercentAtApproval || 0,
      clip.fraudScore || 0,
      clip.videoUnavailable ? "No" : "Yes",
      fmtDate(clip.createdAt),
      fmtDate(clip.reviewedAt),
    ]);
    styleDataRow(r, i);

    // Status color
    const statusCell = r.getCell(6);
    if (clip.status === "APPROVED") statusCell.font = { ...statusCell.font, color: { argb: "FF16A34A" } };
    else if (clip.status === "REJECTED") statusCell.font = { ...statusCell.font, color: { argb: "FFDC2626" } };
    else if (clip.status === "PENDING") statusCell.font = { ...statusCell.font, color: { argb: "FFD97706" } };

    // Number formats
    for (const col of [7, 8, 9, 10]) r.getCell(col).numFmt = "#,##0";
    for (const col of [11, 13, 14, 15]) r.getCell(col).numFmt = "#,##0.00";
  });

  autoWidth(cd, { 1: 12, 2: 15, 3: 20, 5: 40 });

  // ── Sheet 3: Clipper Summary ──
  const cs = wb.addWorksheet("Clipper Summary");
  const clipperHeaders = ["Clipper", "Email", "Level", "Streak", "Total Earnings", "Total Views", "Approved Clips", "Pending", "Rejected", "Paid Out", "Available", "Fee %", "Referred", "PWA User"];
  const csHeader = cs.addRow(clipperHeaders);
  styleHeaderRow(csHeader);
  cs.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

  const clipperMap: Record<string, any> = {};
  for (const clip of clips) {
    const uid = clip.userId;
    if (!uid) continue;
    if (!clipperMap[uid]) {
      clipperMap[uid] = {
        name: clip.user?.username || clip.user?.name || "Unknown",
        email: clip.user?.email || "",
        level: clip.user?.level || 0,
        streak: clip.user?.currentStreak || 0,
        earnings: 0, views: 0, approved: 0, pending: 0, rejected: 0,
        referred: !!clip.user?.referredById,
        pwa: clip.user?.isPWAUser || false,
      };
    }
    const u = clipperMap[uid];
    const stat = clip.stats?.[0];
    u.views += stat?.views || 0;
    if (clip.status === "APPROVED" && !clip.videoUnavailable) { u.approved++; u.earnings += clip.earnings || 0; }
    else if (clip.status === "PENDING") u.pending++;
    else if (clip.status === "REJECTED") u.rejected++;
  }

  Object.values(clipperMap)
    .sort((a: any, b: any) => b.earnings - a.earnings)
    .forEach((u: any, i: number) => {
      const r = cs.addRow([
        safe(u.name), safe(u.email), u.level, u.streak,
        u.earnings, u.views, u.approved, u.pending, u.rejected,
        0, u.earnings, 9,
        u.referred ? "Yes" : "No",
        u.pwa ? "Yes" : "No",
      ]);
      styleDataRow(r, i);
      r.getCell(5).numFmt = "#,##0.00";
      r.getCell(6).numFmt = "#,##0";
      r.getCell(10).numFmt = "#,##0.00";
      r.getCell(11).numFmt = "#,##0.00";
    });

  autoWidth(cs, { 1: 15, 2: 25 });

  // ── Sheet 4: Campaign Summary ──
  const camp = wb.addWorksheet("Campaign Summary");
  const campHeaders = ["Campaign", "Status", "Budget", "Spent", "Remaining", "Clipper CPM", "Owner CPM", "Total Clips", "Approved", "Views", "Clipper Earnings", "Owner Earnings", "Active Clippers", "Created"];
  const campHeader = camp.addRow(campHeaders);
  styleHeaderRow(campHeader);
  camp.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

  const campStats: Record<string, any> = {};
  for (const c of campaigns) {
    campStats[c.id] = {
      name: c.name, status: c.status, budget: c.budget || 0,
      clipperCpm: c.clipperCpm ?? c.cpmRate ?? 0, ownerCpm: c.ownerCpm || 0,
      totalClips: 0, approved: 0, views: 0, clipperEarnings: 0, ownerEarnings: 0,
      clippers: new Set(), created: c.createdAt,
    };
  }
  for (const clip of clips) {
    const cs2 = campStats[clip.campaignId];
    if (!cs2) continue;
    cs2.totalClips++;
    if (clip.userId) cs2.clippers.add(clip.userId);
    cs2.views += clip.stats?.[0]?.views || 0;
    if (clip.status === "APPROVED" && !clip.videoUnavailable) {
      cs2.approved++;
      cs2.clipperEarnings += clip.earnings || 0;
      cs2.ownerEarnings += clip.agencyEarning?.amount || 0;
    }
  }

  Object.values(campStats)
    .sort((a: any, b: any) => (b.clipperEarnings + b.ownerEarnings) - (a.clipperEarnings + a.ownerEarnings))
    .forEach((c: any, i: number) => {
      const spent = c.clipperEarnings + c.ownerEarnings;
      const r = camp.addRow([
        safe(c.name), c.status, c.budget, spent, Math.max(c.budget - spent, 0),
        c.clipperCpm, c.ownerCpm, c.totalClips, c.approved, c.views,
        c.clipperEarnings, c.ownerEarnings, c.clippers.size, fmtDate(c.created),
      ]);
      styleDataRow(r, i);
      for (const col of [3, 4, 5, 6, 7, 11, 12]) r.getCell(col).numFmt = "#,##0.00";
      for (const col of [8, 9, 10]) r.getCell(col).numFmt = "#,##0";
    });

  autoWidth(camp, { 1: 20 });
}

// ─── CLIENT WORKBOOK ────────────────────────────────────────

async function buildClientWorkbook(
  wb: ExcelJS.Workbook,
  clips: any[],
  campaigns: any[],
  campaignId: string,
  timeframe: number,
) {
  const campaign = campaigns.find((c) => c.id === campaignId);
  const campaignName = campaign?.name || "Campaign";
  const approved = clips.filter((c) => c.status === "APPROVED" && !c.videoUnavailable);
  const pending = clips.filter((c) => c.status === "PENDING");
  const totalViews = approved.reduce((s, c) => s + (c.stats?.[0]?.views || 0), 0);
  const totalLikes = approved.reduce((s, c) => s + (c.stats?.[0]?.likes || 0), 0);
  const totalComments = approved.reduce((s, c) => s + (c.stats?.[0]?.comments || 0), 0);
  const totalShares = approved.reduce((s, c) => s + (c.stats?.[0]?.shares || 0), 0);
  const totalEarnings = approved.reduce((s, c) => s + (c.earnings || 0), 0);
  const ownerEarnings = approved.reduce((s, c) => s + (c.agencyEarning?.amount || 0), 0);
  const totalSpent = totalEarnings + ownerEarnings;
  const budget = campaign?.budget || 0;
  const avgViews = approved.length > 0 ? Math.round(totalViews / approved.length) : 0;
  const topViews = approved.reduce((max, c) => Math.max(max, c.stats?.[0]?.views || 0), 0);

  // ── Sheet 1: Campaign Report ──
  const rpt = wb.addWorksheet("Campaign Report");
  rpt.getCell("A1").value = "CLIPPERS HQ";
  rpt.getCell("A1").font = { bold: true, size: 20, color: { argb: `FF${ACCENT}` }, name: "Calibri" };
  rpt.getCell("A2").value = "Campaign Performance Report";
  rpt.getCell("A2").font = { size: 14, color: { argb: "FF6B7280" }, name: "Calibri" };
  rpt.getCell("A4").value = `Campaign: ${campaignName}`;
  rpt.getCell("A4").font = { bold: true, size: 12, name: "Calibri" };
  const startDate = campaign?.startDate || campaign?.createdAt;
  rpt.getCell("A5").value = `Report Period: ${startDate ? new Date(startDate).toLocaleDateString("en-US") : "Start"} — ${new Date().toLocaleDateString("en-US")}`;
  rpt.getCell("A6").value = `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;

  const metrics = [
    ["Total Budget", budget, true],
    ["Amount Spent", totalSpent, true],
    ["Budget Remaining", Math.max(budget - totalSpent, 0), true],
    [null, null, false],
    ["Total Clips Submitted", clips.length, false],
    ["Clips Approved", approved.length, false],
    ["Clips Pending Review", pending.length, false],
    [null, null, false],
    ["Total Views", totalViews, false],
    ["Total Likes", totalLikes, false],
    ["Total Comments", totalComments, false],
    ["Total Shares", totalShares, false],
    [null, null, false],
    ["Average Views Per Clip", avgViews, false],
    ["Top Performing Clip Views", topViews, false],
  ];

  let r = 8;
  for (const [label, val, isMoney] of metrics) {
    if (label === null) {
      // Separator
      const sepRow = rpt.getRow(r);
      sepRow.getCell(1).border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } };
      sepRow.getCell(2).border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } };
      r++;
      continue;
    }
    const row = rpt.getRow(r);
    row.getCell(1).value = label as string;
    row.getCell(1).font = { bold: true, name: "Calibri", size: 11 };
    row.getCell(1).fill = GRAY_FILL;
    row.getCell(1).border = THIN_BORDER;
    row.getCell(2).value = val as number;
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(2).border = THIN_BORDER;
    row.getCell(2).numFmt = isMoney ? "#,##0.00" : "#,##0";
    r++;
  }
  rpt.getColumn(1).width = 30;
  rpt.getColumn(2).width = 20;

  // ── Sheet 2: Clip Performance ──
  const perf = wb.addWorksheet("Clip Performance");
  const perfHeaders = ["#", "Platform", "Clip URL", "Status", "Views", "Likes", "Comments", "Shares", "Earnings", "Submitted"];
  const perfHeader = perf.addRow(perfHeaders);
  styleHeaderRow(perfHeader);
  perf.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

  // Sort by views descending
  const sortedClips = [...clips].sort((a, b) => (b.stats?.[0]?.views || 0) - (a.stats?.[0]?.views || 0));

  sortedClips.forEach((clip, i) => {
    const stat = clip.stats?.[0];
    const row = perf.addRow([
      i + 1,
      safe(clip.campaign?.platform || ""),
      safe(clip.clipUrl || ""),
      clip.status,
      stat?.views || 0,
      stat?.likes || 0,
      stat?.comments || 0,
      stat?.shares || 0,
      clip.earnings || 0,
      fmtDate(clip.createdAt),
    ]);
    styleDataRow(row, i);

    const statusCell = row.getCell(4);
    if (clip.status === "APPROVED") statusCell.font = { ...statusCell.font, color: { argb: "FF16A34A" } };
    else if (clip.status === "REJECTED") statusCell.font = { ...statusCell.font, color: { argb: "FFDC2626" } };
    else if (clip.status === "PENDING") statusCell.font = { ...statusCell.font, color: { argb: "FFD97706" } };

    for (const col of [5, 6, 7, 8]) row.getCell(col).numFmt = "#,##0";
    row.getCell(9).numFmt = "#,##0.00";
  });

  autoWidth(perf, { 3: 40 });

  // ── Sheet 3: Daily Breakdown ──
  const daily = wb.addWorksheet("Daily Breakdown");
  const dailyHeaders = ["Date", "New Clips", "Views", "Likes", "Comments", "Shares", "Daily Spend"];
  const dailyHeader = daily.addRow(dailyHeaders);
  styleHeaderRow(dailyHeader);
  daily.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

  const dayMap: Record<string, { clips: number; views: number; likes: number; comments: number; shares: number; spend: number }> = {};
  for (const clip of clips) {
    if (!clip.createdAt) continue;
    const day = new Date(clip.createdAt).toISOString().split("T")[0];
    if (!dayMap[day]) dayMap[day] = { clips: 0, views: 0, likes: 0, comments: 0, shares: 0, spend: 0 };
    const d = dayMap[day];
    d.clips++;
    const stat = clip.stats?.[0];
    d.views += stat?.views || 0;
    d.likes += stat?.likes || 0;
    d.comments += stat?.comments || 0;
    d.shares += stat?.shares || 0;
    if (clip.status === "APPROVED" && !clip.videoUnavailable) {
      d.spend += (clip.earnings || 0) + (clip.agencyEarning?.amount || 0);
    }
  }

  const sortedDays = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));
  let totals = { clips: 0, views: 0, likes: 0, comments: 0, shares: 0, spend: 0 };

  sortedDays.forEach(([date, d], i) => {
    const row = daily.addRow([date, d.clips, d.views, d.likes, d.comments, d.shares, d.spend]);
    styleDataRow(row, i);
    for (const col of [2, 3, 4, 5, 6]) row.getCell(col).numFmt = "#,##0";
    row.getCell(7).numFmt = "#,##0.00";
    totals.clips += d.clips;
    totals.views += d.views;
    totals.likes += d.likes;
    totals.comments += d.comments;
    totals.shares += d.shares;
    totals.spend += d.spend;
  });

  // Totals row
  const totalRow = daily.addRow(["TOTAL", totals.clips, totals.views, totals.likes, totals.comments, totals.shares, totals.spend]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, name: "Calibri", size: 11 };
    cell.border = THIN_BORDER;
  });
  for (const col of [2, 3, 4, 5, 6]) totalRow.getCell(col).numFmt = "#,##0";
  totalRow.getCell(7).numFmt = "#,##0.00";

  autoWidth(daily);
}
