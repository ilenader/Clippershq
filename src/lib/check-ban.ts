/**
 * Ban enforcement for API routes.
 * Call after getSession() — if it returns a Response, return it immediately.
 */

import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth-types";

export function checkBanStatus(session: any): Response | null {
  const status = (session?.user as SessionUser | undefined)?.status;

  if (status === "BANNED") {
    return NextResponse.json(
      { error: "Your account has been permanently banned.", banned: true },
      { status: 403 },
    );
  }

  return null;
}
