import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/test-email — OWNER ONLY
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if ((session.user as any).role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.EMAIL_API_KEY || "";
  const from = process.env.EMAIL_FROM || "Clippers HQ <onboarding@resend.dev>";
  const to = "delivered@resend.dev";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "EMAIL_API_KEY not set" });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: "Test email from Clippers HQ",
        html: "<h1>Test</h1><p>This is a test email from Clippers HQ.</p>",
      }),
    });

    const body = await res.text();

    // Check for unicode characters in API key (common copy-paste issue)
    const hasUnicode = /[^\x00-\x7F]/.test(apiKey);

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      response: body,
      from,
      to,
      keyConfigured: apiKey.length > 0,
      keyLength: apiKey.length,
      hasUnicodeInKey: hasUnicode,
      hint: hasUnicode ? "Your API key contains non-ASCII characters (likely × instead of x). Fix in .env.local." : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
