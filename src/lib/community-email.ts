/**
 * Community-specific email helpers. Kept separate from src/lib/email.ts so the core email
 * module stays untouched. Uses the Resend API directly with a single 2s retry on transient
 * failure — same pattern as sendEmailWithRetry in email.ts but self-contained.
 */
import { escapeHtml } from "@/lib/email";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

async function resendWithRetry(params: EmailParams): Promise<boolean> {
  const apiKey = process.env.EMAIL_API_KEY || "";
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (!apiKey) console.log(`[COMMUNITY EMAIL PREVIEW] To: ${params.to} | Subject: ${params.subject}`);
    return false;
  }

  const attempt = async () => {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (await attempt()) return true;
  await new Promise((r) => setTimeout(r, 2000));
  return attempt();
}

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html style="background-color:#0a0d12;">
<head><meta charset="utf-8"><meta name="color-scheme" content="dark only"></head>
<body style="margin:0;padding:0;background-color:#0a0d12;color:#e8edf2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0d12;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#111720;border-radius:16px;border:1px solid #1c2333;overflow:hidden;">
<tr><td style="padding:24px 24px 16px;text-align:center;border-bottom:1px solid #1c2333;">
<img src="https://clipershq.com/icon-512.png" width="40" height="40" alt="" style="display:block;margin:0 auto 8px;" />
<h2 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:2px;">CLIPPERS HQ</h2>
</td></tr>
<tr><td style="padding:24px;color:#e8edf2;">${content}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #1c2333;text-align:center;background-color:#0d1117;">
<p style="color:#6b7280;font-size:12px;margin:0;">&copy; 2026 Clippers HQ &mdash; <a href="https://clipershq.com" style="color:#6b7280;text-decoration:none;">clipershq.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function sendCommunityAnnouncementEmail(
  to: string,
  campaignName: string,
  senderName: string,
  message: string,
): Promise<boolean> {
  const preview = message.length > 500 ? message.slice(0, 497) + "…" : message;
  return resendWithRetry({
    to,
    subject: `Announcement: ${campaignName}`,
    html: wrap(`
      <p style="font-size:12px;color:#2596be;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">New Announcement</p>
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 16px;">${escapeHtml(campaignName)}</h1>
      <p style="font-size:14px;color:#a1a1aa;margin:0 0 16px;">From <strong style="color:#fff;">${escapeHtml(senderName)}</strong></p>
      <div style="border-left:3px solid #2596be;background-color:#0d1117;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px;">
        <p style="margin:0;color:#d4d4d8;font-size:15px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(preview)}</p>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td align="center" style="border-radius:8px;background-color:#2596be;">
          <a href="https://clipershq.com/community" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">View in Community</a>
        </td></tr>
      </table>
    `),
  });
}
