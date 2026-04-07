import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json([]);

  const entries = await db.chatKnowledge.findMany({ orderBy: { category: "asc" } });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { category, question, answer } = body;
  if (!category || !question || !answer) {
    return NextResponse.json({ error: "category, question, and answer are required" }, { status: 400 });
  }

  const entry = await db.chatKnowledge.create({ data: { category, question, answer } });
  return NextResponse.json(entry, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id, category, question, answer } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const entry = await db.chatKnowledge.update({
    where: { id },
    data: { ...(category && { category }), ...(question && { question }), ...(answer && { answer }) },
  });
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await db.chatKnowledge.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
