import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;
  const { action, rejectionReason } = body;

  if (!["VERIFIED", "APPROVED", "REJECTED"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updateData: any = {
    status: action,
    rejectionReason: action === "REJECTED" ? rejectionReason : null,
  };

  if (action === "VERIFIED") {
    updateData.verifiedAt = new Date().toISOString();
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    await db.clipAccount.update({
      where: { id },
      data: {
        ...updateData,
        verifiedAt: updateData.verifiedAt ? new Date(updateData.verifiedAt) : undefined,
      },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DB account review failed:", err?.message);
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
}
