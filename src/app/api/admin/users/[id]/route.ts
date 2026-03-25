import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/admin/users/[id] — Update user role (OWNER only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can change roles" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { role: newRole } = body;
  if (!["CLIPPER", "ADMIN", "OWNER"].includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent owner from demoting themselves
  if (id === session.user.id && newRole !== "OWNER") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  try {
    const updated = await db.user.update({
      where: { id },
      data: { role: newRole },
      select: { id: true, username: true, email: true, role: true },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}
