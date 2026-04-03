import { buildEarningsChart, type Clip } from "../src/lib/earnings";

let passed = 0, failed = 0;
function assert(ok: boolean, msg: string) { ok ? (passed++, console.log(`  ✅ ${msg}`)) : (failed++, console.log(`  ❌ ${msg}`)); }

const today = new Date().toISOString();

const clips: Clip[] = [
  { id: "1", createdAt: today, earnings: 5, status: "APPROVED", campaign: { name: "C1" } },
  { id: "2", createdAt: today, earnings: 23, status: "REJECTED", campaign: { name: "C1" } },
  { id: "3", createdAt: today, earnings: 3, status: "PENDING", campaign: { name: "C1" } },
  { id: "4", createdAt: today, earnings: 7, status: "APPROVED", campaign: { name: "C1" } },
];

function todayTotal(data: { label: string; value: number }[]): number {
  const todayKey = `${new Date().getMonth() + 1}/${new Date().getDate()}`;
  return data.find(d => d.label === todayKey)?.value || 0;
}

console.log("── A) Default filter (empty = only APPROVED) ──");
const defaultData = buildEarningsChart(clips, 14, []);
const defaultTotal = todayTotal(defaultData);
console.log(`  Today's chart value: $${defaultTotal}`);
assert(defaultTotal === 12, `Default shows $${defaultTotal} (expected $12: $5 + $7 approved only)`);

console.log("\n── B) 'total' filter = only APPROVED ──");
const totalData = buildEarningsChart(clips, 14, ["total"]);
const totalTotal = todayTotal(totalData);
assert(totalTotal === 12, `'total' filter shows $${totalTotal} (expected $12)`);

console.log("\n── C) 'approved' filter ──");
const approvedData = buildEarningsChart(clips, 14, ["approved"]);
const approvedTotal = todayTotal(approvedData);
assert(approvedTotal === 12, `'approved' filter shows $${approvedTotal} (expected $12)`);

console.log("\n── D) 'pending' filter ──");
const pendingData = buildEarningsChart(clips, 14, ["pending"]);
const pendingTotal = todayTotal(pendingData);
assert(pendingTotal === 3, `'pending' filter shows $${pendingTotal} (expected $3)`);

console.log("\n── E) 'approved' + 'pending' together ──");
const bothData = buildEarningsChart(clips, 14, ["approved", "pending"]);
const bothTotal = todayTotal(bothData);
assert(bothTotal === 15, `approved+pending shows $${bothTotal} (expected $15: $5+$7+$3)`);

console.log("\n── F) Rejected clip NEVER shows (THE BUG) ──");
const rejectClipOnly: Clip[] = [
  { id: "r1", createdAt: today, earnings: 23, status: "REJECTED", campaign: { name: "C1" } },
];
const rejectDefault = todayTotal(buildEarningsChart(rejectClipOnly, 14, []));
const rejectTotal = todayTotal(buildEarningsChart(rejectClipOnly, 14, ["total"]));
const rejectApproved = todayTotal(buildEarningsChart(rejectClipOnly, 14, ["approved"]));
const rejectPending = todayTotal(buildEarningsChart(rejectClipOnly, 14, ["pending"]));
assert(rejectDefault === 0, `Rejected clip default: $${rejectDefault} (expected $0)`);
assert(rejectTotal === 0, `Rejected clip 'total': $${rejectTotal} (expected $0)`);
assert(rejectApproved === 0, `Rejected clip 'approved': $${rejectApproved} (expected $0)`);
assert(rejectPending === 0, `Rejected clip 'pending': $${rejectPending} (expected $0)`);

console.log("\n── G) FLAGGED clip never shows ──");
const flaggedClip: Clip[] = [{ id: "f1", createdAt: today, earnings: 10, status: "FLAGGED", campaign: { name: "C1" } }];
assert(todayTotal(buildEarningsChart(flaggedClip, 14, [])) === 0, "Flagged clip: $0");

console.log(`\n${"═".repeat(40)}`);
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
console.log("═".repeat(40));
process.exit(failed > 0 ? 1 : 0);
