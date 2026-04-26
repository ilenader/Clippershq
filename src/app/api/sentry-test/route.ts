import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.SENTRY_TEST_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Sentry test endpoint disabled" },
      { status: 403 }
    );
  }
  throw new Error("Sentry test error — intentional, safe to ignore");
}
