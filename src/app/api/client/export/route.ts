import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
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
  row.eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; cell.border = THIN_BORDER; cell.alignment = { vertical: "middle", horizontal: "center" }; });
}
function styleDataRow(row: ExcelJS.Row, idx: number) {
  row.height = 20;
  row.eachCell((cell) => { cell.border = THIN_BORDER; cell.font = { name: "Calibri", size: 10 }; if (idx % 2 === 1) cell.fill = ALT_FILL; });
}
function autoWidth(sheet: ExcelJS.Worksheet, minWidths?: Record<number, number>) {
  sheet.columns.forEach((col, i) => { const min = minWidths?.[i + 1] || 10; let max = min; col.eachCell?.({ includeEmpty: false }, (cell) => { const len = String(cell.value ?? "").length + 2; if (len > max) max = len; }); col.width = Math.min(max, 50); });
}
function fmtDate(d: Date | string | null): string { if (!d) return ""; return new Date(d).toISOString().replace("T", " ").substring(0, 16); }

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "CLIENT" && role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const campaignId = req.nextUrl.searchParams.get("campaignId");
    if (!campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });

    // Verify access
    if (role === "CLIENT") {
      const access = await db.campaignClient.findUnique({
        where: { userId_campaignId: { userId: session.user.id, campaignId } },
      });
      if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, platform: true, status: true, budget: true, startDate: true, createdAt: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const clips = await db.clip.findMany({
      where: { campaignId, isDeleted: false },
      include: {
        campaign: { select: { platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
        agencyEarning: { select: { amount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Clippers HQ";
    wb.created = new Date();

    const approved = clips.filter((c: any) => c.status === "APPROVED" && !c.videoUnavailable);
    const pending = clips.filter((c: any) => c.status === "PENDING");
    const totalViews = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.views || 0), 0);
    const totalLikes = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.likes || 0), 0);
    const totalComments = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.comments || 0), 0);
    const totalShares = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.shares || 0), 0);
    const totalEarnings = approved.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    const ownerEarnings = approved.reduce((s: number, c: any) => s + (c.agencyEarning?.amount || 0), 0);
    const totalSpent = totalEarnings + ownerEarnings;
    const budget = campaign.budget || 0;
    const avgViews = approved.length > 0 ? Math.round(totalViews / approved.length) : 0;
    const topViews = approved.reduce((max: number, c: any) => Math.max(max, c.stats?.[0]?.views || 0), 0);

    // Sheet 1: Campaign Report
    const rpt = wb.addWorksheet("Campaign Report");
    rpt.getCell("A1").value = "CLIPPERS HQ";
    rpt.getCell("A1").font = { bold: true, size: 20, color: { argb: `FF${ACCENT}` }, name: "Calibri" };
    rpt.getCell("A2").value = "Campaign Performance Report";
    rpt.getCell("A2").font = { size: 14, color: { argb: "FF6B7280" }, name: "Calibri" };
    rpt.getCell("A4").value = `Campaign: ${campaign.name}`;
    rpt.getCell("A4").font = { bold: true, size: 12, name: "Calibri" };
    const startDate = campaign.startDate || campaign.createdAt;
    rpt.getCell("A5").value = `Report Period: ${startDate ? new Date(startDate).toLocaleDateString("en-US") : "Start"} — ${new Date().toLocaleDateString("en-US")}`;
    rpt.getCell("A6").value = `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;

    const metrics: [string | null, number | null, boolean][] = [
      ["Total Budget", budget, true], ["Amount Spent", totalSpent, true], ["Budget Remaining", Math.max(budget - totalSpent, 0), true],
      [null, null, false],
      ["Total Clips Submitted", clips.length, false], ["Clips Approved", approved.length, false], ["Clips Pending Review", pending.length, false],
      [null, null, false],
      ["Total Views", totalViews, false], ["Total Likes", totalLikes, false], ["Total Comments", totalComments, false], ["Total Shares", totalShares, false],
      [null, null, false],
      ["Average Views Per Clip", avgViews, false], ["Top Performing Clip Views", topViews, false],
    ];
    let r = 8;
    for (const [label, val, isMoney] of metrics) {
      if (label === null) { const sepRow = rpt.getRow(r); sepRow.getCell(1).border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } }; sepRow.getCell(2).border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } }; r++; continue; }
      const row = rpt.getRow(r);
      row.getCell(1).value = label; row.getCell(1).font = { bold: true, name: "Calibri", size: 11 }; row.getCell(1).fill = GRAY_FILL; row.getCell(1).border = THIN_BORDER;
      row.getCell(2).value = val; row.getCell(2).alignment = { horizontal: "right" }; row.getCell(2).border = THIN_BORDER; row.getCell(2).numFmt = isMoney ? "#,##0.00" : "#,##0";
      r++;
    }
    rpt.getColumn(1).width = 30; rpt.getColumn(2).width = 20;

    // Sheet 2: Clip Performance
    const perf = wb.addWorksheet("Clip Performance");
    styleHeaderRow(perf.addRow(["#", "Platform", "Clip URL", "Status", "Views", "Likes", "Comments", "Shares", "Earnings", "Submitted"]));
    perf.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];
    const sortedClips = [...clips].sort((a: any, b: any) => (b.stats?.[0]?.views || 0) - (a.stats?.[0]?.views || 0));
    sortedClips.forEach((clip: any, i: number) => {
      const stat = clip.stats?.[0];
      const row = perf.addRow([i + 1, clip.campaign?.platform || "", clip.clipUrl || "", clip.status, stat?.views || 0, stat?.likes || 0, stat?.comments || 0, stat?.shares || 0, clip.earnings || 0, fmtDate(clip.createdAt)]);
      styleDataRow(row, i);
      const sc = row.getCell(4);
      if (clip.status === "APPROVED") sc.font = { ...sc.font, color: { argb: "FF16A34A" } };
      else if (clip.status === "REJECTED") sc.font = { ...sc.font, color: { argb: "FFDC2626" } };
      else if (clip.status === "PENDING") sc.font = { ...sc.font, color: { argb: "FFD97706" } };
      for (const col of [5, 6, 7, 8]) row.getCell(col).numFmt = "#,##0";
      row.getCell(9).numFmt = "#,##0.00";
    });
    autoWidth(perf, { 3: 40 });

    // Sheet 3: Daily Breakdown
    const daily = wb.addWorksheet("Daily Breakdown");
    styleHeaderRow(daily.addRow(["Date", "New Clips", "Views", "Likes", "Comments", "Shares", "Daily Spend"]));
    daily.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];
    const dayMap: Record<string, { clips: number; views: number; likes: number; comments: number; shares: number; spend: number }> = {};
    for (const clip of clips as any[]) {
      if (!clip.createdAt) continue;
      const day = new Date(clip.createdAt).toISOString().split("T")[0];
      if (!dayMap[day]) dayMap[day] = { clips: 0, views: 0, likes: 0, comments: 0, shares: 0, spend: 0 };
      dayMap[day].clips++;
      const stat = clip.stats?.[0];
      dayMap[day].views += stat?.views || 0; dayMap[day].likes += stat?.likes || 0; dayMap[day].comments += stat?.comments || 0; dayMap[day].shares += stat?.shares || 0;
      if (clip.status === "APPROVED" && !clip.videoUnavailable) dayMap[day].spend += (clip.earnings || 0) + (clip.agencyEarning?.amount || 0);
    }
    const sortedDays = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));
    let totals = { clips: 0, views: 0, likes: 0, comments: 0, shares: 0, spend: 0 };
    sortedDays.forEach(([date, d], i) => {
      const row = daily.addRow([date, d.clips, d.views, d.likes, d.comments, d.shares, d.spend]);
      styleDataRow(row, i);
      for (const col of [2, 3, 4, 5, 6]) row.getCell(col).numFmt = "#,##0";
      row.getCell(7).numFmt = "#,##0.00";
      totals.clips += d.clips; totals.views += d.views; totals.likes += d.likes; totals.comments += d.comments; totals.shares += d.shares; totals.spend += d.spend;
    });
    const totalRow = daily.addRow(["TOTAL", totals.clips, totals.views, totals.likes, totals.comments, totals.shares, totals.spend]);
    totalRow.eachCell((cell) => { cell.font = { bold: true, name: "Calibri", size: 11 }; cell.border = THIN_BORDER; });
    for (const col of [2, 3, 4, 5, 6]) totalRow.getCell(col).numFmt = "#,##0";
    totalRow.getCell(7).numFmt = "#,##0.00";
    autoWidth(daily);

    const buffer = await wb.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split("T")[0];
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.xlsx",
        "Content-Disposition": `attachment; filename="campaign-report-${dateStr}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error("[CLIENT-EXPORT] Error:", err?.message);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
