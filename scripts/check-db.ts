import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("Connecting...");
  const campaigns = await db.campaign.findMany({ select: { id: true, name: true, isArchived: true, status: true } });
  console.log("CAMPAIGNS:", campaigns.length, JSON.stringify(campaigns));

  const clips = await db.clip.findMany({ select: { id: true, campaignId: true, status: true, userId: true }, take: 10 });
  console.log("CLIPS:", clips.length, JSON.stringify(clips));

  const users = await db.user.findMany({ select: { id: true, username: true, role: true } });
  console.log("USERS:", users.length, JSON.stringify(users));

  // Test the exact query the clips API uses for OWNER
  const ownerClips = await db.clip.findMany({
    where: { campaign: { isArchived: false } },
    include: {
      user: { select: { username: true, trustScore: true } },
      campaign: { select: { name: true, platform: true, isArchived: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 3 },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log("OWNER CLIPS QUERY:", ownerClips.length, JSON.stringify(ownerClips.map(c => ({ id: c.id, campaign: c.campaign?.name, status: c.status }))));

  await db.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
