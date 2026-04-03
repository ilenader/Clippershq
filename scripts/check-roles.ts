import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
async function main() {
  const users = await db.user.findMany({ select: { id: true, username: true, role: true, email: true, status: true } });
  for (const u of users) console.log(`${u.role.padEnd(8)} | ${u.username.padEnd(20)} | ${u.email || "—"} | ${u.id}`);

  // Specifically check the owner
  const owner = users.find(u => u.email === "digitalzentro@gmail.com");
  if (owner) {
    console.log(`\n✅ Owner found: role=${owner.role}, id=${owner.id}`);
    if (owner.role !== "OWNER") {
      console.log("❌ OWNER role NOT set! This is the bug - fixing now...");
      await db.user.update({ where: { id: owner.id }, data: { role: "OWNER" } });
      console.log("✅ Fixed: role set to OWNER");
    }
  } else {
    console.log("\n❌ No user with digitalzentro@gmail.com found!");
  }

  // Check Dusan (clipper)
  const dusan = users.find(u => u.username === "Dusan");
  if (dusan) {
    console.log(`\nClipper Dusan: role=${dusan.role}, id=${dusan.id}`);
    // Verify his clips are findable
    const clips = await db.clip.findMany({
      where: { userId: dusan.id, isDeleted: false, campaign: { isArchived: false } },
      select: { id: true, clipUrl: true, status: true },
    });
    console.log(`His clips (with filters): ${clips.length}`);
    for (const c of clips) console.log(`  ${c.status} | ${c.clipUrl}`);
  }

  await db.$disconnect();
}
main();
