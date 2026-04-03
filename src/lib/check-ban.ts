/**
 * Ban enforcement for API routes.
 * Call after getSession() — if it returns a Response, return it immediately.
 */

import { NextResponse } from "next/server";

export function checkBanStatus(session: any): Response | null {
  const status = (session?.user as any)?.status;

  if (status === "BANNED") {
    return NextResponse.json(
      { error: "Your account has been permanently banned.", banned: true },
      { status: 403 },
    );
  }

  return null;
}
