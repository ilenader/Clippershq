import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  // All clips in DB
  const allClips = await db.clip.findMany({
    select: { id: true, userId: true, campaignId: true, clipUrl: true, status: true, isDeleted: true, earnings: true, createdAt: true },
  });
  console.log(`\nALL CLIPS IN DB: ${allClips.length}`);
  for (const c of allClips) {
    console.log(`  ${c.id} | user=${c.userId.slice(0, 12)}... | campaign=${c.campaignId.slice(0, 12)}... | status=${c.status} | deleted=${c.isDeleted} | url=${c.clipUrl.slice(0, 50)}`);
  }

  // All campaigns
  const campaigns = await db.campaign.findMany({
    select: { id: true, name: true, isArchived: true, status: true },
  });
  console.log(`\nALL CAMPAIGNS: ${campaigns.length}`);
  for (const c of campaigns) {
    console.log(`  ${c.id} | name=${c.name} | archived=${c.isArchived} | status=${c.status}`);
  }

  // Clipper's view (mine endpoint query)
  const users = await db.user.findMany({ select: { id: true, username: true, role: true } });
  console.log(`\nALL USERS: ${users.length}`);
  for (const u of users) {
    console.log(`  ${u.id} | ${u.username} | ${u.role}`);
  }

  // For each non-dev user, test the /mine query
  for (const u of users.filter(u => !u.id.startsWith("dev-"))) {
    const myClips = await db.clip.findMany({
      where: { userId: u.id, isDeleted: false, campaign: { isArchived: false } },
      include: { campaign: { select: { name: true, isArchived: true } } },
    });
    console.log(`\n  ${u.username} (${u.role}) clips visible: ${myClips.length}`);
    for (const c of myClips) {
      console.log(`    ${c.id} | ${c.campaign?.name} | archived=${c.campaign?.isArchived} | status=${c.status}`);
    }
  }

  // Owner query (all non-archived, non-deleted)
  const ownerClips = await db.clip.findMany({
    where: { isDeleted: false, campaign: { isArchived: false } },
    include: { campaign: { select: { name: true, isArchived: true } }, user: { select: { username: true } } },
  });
  console.log(`\nOWNER VIEW clips: ${ownerClips.length}`);
  for (const c of ownerClips) {
    console.log(`  ${c.id} | ${c.user?.username} | ${c.campaign?.name} | status=${c.status}`);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
