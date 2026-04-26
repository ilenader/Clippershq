import { getSession } from "@/lib/get-session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.SENTRY_TEST_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Sentry test endpoint disabled" },
      { status: 403 }
    );
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  throw new Error("Sentry test error — intentional, safe to ignore");
}
