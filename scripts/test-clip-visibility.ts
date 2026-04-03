/**
 * Direct DB test: creates a clip and verifies it would be returned by both
 * /api/clips/mine (clipper) and /api/clips (owner) queries.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🔌 Connected\n");

  // Find real users
  const users = await db.user.findMany({ select: { id: true, username: true, role: true, email: true } });
  console.log("Users in DB:");
  for (const u of users) console.log(`  ${u.id} | ${u.username} | ${u.role} | ${u.email}`);

  // Find real campaigns
  const campaigns = await db.campaign.findMany({ where: { isArchived: false }, select: { id: true, name: true, status: true, createdById: true } });
  console.log("\nCampaigns:");
  for (const c of campaigns) console.log(`  ${c.id} | ${c.name} | ${c.status} | creator=${c.createdById}`);

  // Find real accounts
  const accounts = await db.clipAccount.findMany({ select: { id: true, userId: true, username: true, status: true } });
  console.log("\nAccounts:");
  for (const a of accounts) console.log(`  ${a.id} | ${a.username} | ${a.status} | user=${a.userId}`);

  // Find ALL clips (no filter)
  const allClips = await db.clip.findMany({
    select: { id: true, userId: true, campaignId: true, clipUrl: true, status: true, isDeleted: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\nAll clips in DB: ${allClips.length}`);
  for (const c of allClips) {
    console.log(`  ${c.id} | user=${c.userId} | campaign=${c.campaignId} | status=${c.status} | deleted=${c.isDeleted} | ${c.clipUrl}`);
  }

  // Now simulate the EXACT query from /api/clips/mine
  if (users.length > 0) {
    const clipper = users.find(u => u.role === "CLIPPER") || users[0];
    console.log(`\n── Simulating /api/clips/mine for ${clipper.username} (${clipper.id}) ──`);

    const clipperClips = await db.clip.findMany({
      where: {
        userId: clipper.id,
        isDeleted: false,
        campaign: { isArchived: false },
      },
      include: {
        campaign: { select: { name: true, platform: true } },
        clipAccount: { select: { username: true, platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(`  Found: ${clipperClips.length} clips`);
    for (const c of clipperClips) {
      console.log(`    ${c.id} | ${c.campaign?.name} | ${c.clipAccount?.username} | ${c.status}`);
    }
  }

  // Simulate /api/clips for OWNER (no user filter)
  console.log(`\n── Simulating /api/clips for OWNER ──`);
  const ownerClips = await db.clip.findMany({
    where: {
      isDeleted: false,
      campaign: { isArchived: false },
    },
    include: {
      user: { select: { username: true, trustScore: true } },
      campaign: { select: { name: true, platform: true, createdById: true, isArchived: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 3 },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`  Found: ${ownerClips.length} clips`);
  for (const c of ownerClips) {
    console.log(`    ${c.id} | ${c.user?.username} | ${c.campaign?.name} | ${c.status} | archived=${c.campaign?.isArchived}`);
  }

  // Check if there are clips with isDeleted=true
  const deletedClips = await db.clip.findMany({ where: { isDeleted: true } });
  console.log(`\nDeleted clips (isDeleted=true): ${deletedClips.length}`);

  // Check campaigns with isArchived=true
  const archivedCampaigns = await db.campaign.findMany({ where: { isArchived: true } });
  console.log(`Archived campaigns: ${archivedCampaigns.length}`);
  for (const c of archivedCampaigns) console.log(`  ${c.id} | ${c.name}`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
