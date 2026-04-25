/**
 * Community-specific email helpers. Kept separate from src/lib/email.ts so the core email
 * module stays untouched. Uses the Resend API directly with a single 2s retry on transient
 * failure — same pattern as sendEmailWithRetry in email.ts but self-contained.
 *
 * Chrome (wrap + emailButton) is imported from email.ts so all transactional and community
 * mail share the same black + glow design.
 */
import { escapeHtml, wrap, emailButton } from "@/lib/email";

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
      <p style="font-size: 13px; color: #2596be !important; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 12px;">New Announcement</p>
      <h1 style="color: #ffffff !important; font-size: 22px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; margin: 0 0 12px;">${escapeHtml(campaignName)}</h1>
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0 0 20px;">From <strong style="color: #ffffff !important;">${escapeHtml(senderName)}</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(255, 255, 255, 0.04) !important; border: 1px solid rgba(255, 255, 255, 0.08); border-left: 3px solid #2596be; border-radius: 0 12px 12px 0; margin: 0 0 28px;">
        <tr><td style="padding: 14px 18px; background-color: rgba(255, 255, 255, 0.04) !important;">
          <p style="margin: 0; color: #c8d0d8 !important; font-size: 15px; line-height: 1.6; white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${escapeHtml(preview)}</p>
        </td></tr>
      </table>
      ${emailButton("View in Community", "https://clipershq.com/community")}
    `),
  });
}
