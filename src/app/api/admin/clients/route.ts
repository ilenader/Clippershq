import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: List all client users and their campaign assignments
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const clients = await db.user.findMany({
      where: { role: "CLIENT" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        campaignClients: {
          select: {
            campaignId: true,
            addedAt: true,
            campaign: { select: { name: true } },
          },
        },
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(clients);
  } catch (err: any) {
    console.error("[ADMIN-CLIENTS] Error:", err?.message);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }
}

// POST: Assign a campaign to a client
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const body = await req.json();
    const { email, campaignId } = body;

    if (!email || !campaignId) {
      return NextResponse.json({ error: "Email and campaignId are required" }, { status: 400 });
    }

    // Find or create client user
    let user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: email.trim().toLowerCase(),
          username: email.split("@")[0],
          name: email.split("@")[0],
          role: "CLIENT",
          status: "ACTIVE",
        },
      });
    }

    // Assign campaign
    await db.campaignClient.upsert({
      where: { userId_campaignId: { userId: user.id, campaignId } },
      create: { userId: user.id, campaignId, addedById: session.user.id },
      update: {},
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err: any) {
    console.error("[ADMIN-CLIENTS] Error:", err?.message);
    return NextResponse.json({ error: "Failed to assign campaign" }, { status: 500 });
  }
}

// DELETE: Remove a campaign assignment
export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const campaignId = url.searchParams.get("campaignId");

    if (!userId || !campaignId) {
      return NextResponse.json({ error: "userId and campaignId are required" }, { status: 400 });
    }

    await db.campaignClient.deleteMany({
      where: { userId, campaignId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[ADMIN-CLIENTS] Error:", err?.message);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}
