/**
 * Email service — sends transactional emails to clippers via Resend.
 *
 * To activate:
 *   1. Set EMAIL_API_KEY in env (Resend API key)
 *   2. Set EMAIL_FROM in env (e.g. "Clippers HQ <noreply@clipershq.com>")
 *
 * Until configured, emails are logged to console but not sent.
 */

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Escape user-controlled content before interpolating into HTML email bodies.
 * Prevents stored XSS via usernames, campaign names, rejection reasons, etc.
 * Also strips CR/LF from subjects to block header injection if a non-JSON mailer is ever used.
 */
export function escapeHtml(str: unknown): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeSubject(str: unknown): string {
  return String(str ?? "").replace(/[\r\n]+/g, " ").trim();
}

async function sendEmail(params: EmailParams): Promise<boolean> {
  const apiKey = process.env.EMAIL_API_KEY || "";
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error("[EMAIL] EMAIL_FROM not set — skipping email");
    return false;
  }

  if (!apiKey) {
    console.log(`[EMAIL PREVIEW] To: ${params.to} | Subject: ${params.subject}`);
    return false;
  }

  // Hard 10s timeout on the Resend call. Without it a slow/unreachable Resend
  // hangs the whole route indefinitely — that was turning client invites into
  // a UI-freezing spinner that never resolves. AbortController guarantees the
  // fetch completes one way or the other.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      console.log(`[EMAIL OK] Sent to ${params.to}`);
    } else {
      console.error(`[EMAIL FAIL] ${res.status}`);
    }
    return res.ok;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      console.error(`[EMAIL TIMEOUT] Resend timed out after 10s for ${params.to}`);
      return false;
    }
    console.error("[EMAIL ERROR]", err);
    return false;
  }
}

/**
 * One-retry wrapper for critical transactional emails (clip approval/rejection, chat replies,
 * client invites). Resend occasionally hits 429/5xx; a single 2s delayed retry catches most
 * transient failures without making failing emails slow.
 */
async function sendEmailWithRetry(params: EmailParams): Promise<boolean> {
  const ok = await sendEmail(params);
  if (ok) return true;
  console.log(`[EMAIL RETRY] First attempt failed for ${params.to} — retrying in 2s`);
  await new Promise((r) => setTimeout(r, 2000));
  const retry = await sendEmail(params);
  if (!retry) console.error(`[EMAIL RETRY FAIL] Both attempts failed for ${params.to}`);
  return retry;
}

// ─── Template wrapper ────────────────────────────────────────

function wrap(content: string): string {
  // Brand lockup — triangle PNG + thin white separator + "Clippers HQ" wordmark.
  // Reused in header and footer. Lives inline so the function stays self-contained.
  const lockup = `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; background-color: #000000 !important;">
    <tr style="background-color: #000000;">
      <td valign="middle" style="padding-right: 12px; background-color: #000000 !important; line-height: 1;">
        <img src="https://clipershq.com/email-logo-triangle.png" width="22" height="22" alt="Clippers HQ" style="display: block; border: 0;" />
      </td>
      <td valign="middle" style="padding-left: 12px; border-left: 1px solid #ffffff; height: 22px; line-height: 22px; background-color: #000000 !important;">
        <span style="color: #ffffff !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; letter-spacing: 0.5px; background-color: #000000 !important;">Clippers</span><span style="color: #ffffff !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 400; letter-spacing: 0.5px; background-color: #000000 !important;">&nbsp;HQ</span>
      </td>
    </tr>
  </table>`;

  return `<!DOCTYPE html>
<html style="background-color: #000000;">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark only">
<meta name="supported-color-schemes" content="dark only">
<style type="text/css">
  :root { color-scheme: dark only; }
  body, html, table, td, div, p, span, h1, h2, h3, ol, li, a {
    background-color: #000000 !important;
    color: #e8edf2 !important;
  }
  .inner-box, .inner-box td { background-color: #000000 !important; }
  .footer-bg { background-color: #000000 !important; }
  .stats-cell { background-color: #0d1117 !important; }
  .btn-cell { background-color: #2596be !important; }
  .btn-cell a { background-color: #2596be !important; color: #ffffff !important; }
  @media (prefers-color-scheme: light) {
    body, html, table, td, div, p, span, h1, h2, h3 {
      background-color: #000000 !important;
      color: #e8edf2 !important;
    }
    .inner-box, .inner-box td { background-color: #000000 !important; }
  }
  u + .body { background-color: #000000 !important; }
</style>
</head>
<body bgcolor="#000000" style="margin: 0; padding: 0; background-color: #000000 !important; color: #e8edf2; -webkit-text-size-adjust: 100%;">
<div class="body" style="background-color: #000000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#000000" style="background-color: #000000 !important;">
<tr style="background-color: #000000;"><td align="center" bgcolor="#000000" style="padding: 24px 16px; background-color: #000000 !important;">
  <table class="inner-box" role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#000000" style="max-width: 600px; width: 100%; background-color: #000000 !important;">
    <!-- Header + content cell with corner-glow background image. bgcolor fallback for Outlook. -->
    <tr style="background-color: #000000;">
      <td bgcolor="#000000" background="https://clipershq.com/email-glow-corners.png" style="background-color: #000000 !important; background-image: url(https://clipershq.com/email-glow-corners.png); background-repeat: no-repeat; background-position: center top; background-size: 100% auto;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: transparent;">
          <tr><td align="center" style="padding: 56px 24px 40px; background-color: transparent;">
            ${lockup}
          </td></tr>
          <tr><td style="padding: 8px 32px 48px; color: #e8edf2; background-color: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            ${content}
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- Bottom cinematic glow strip. Empty cell with background-image; bgcolor fallback for Outlook. -->
    <tr style="background-color: #000000;">
      <td bgcolor="#000000" height="120" background="https://clipershq.com/email-glow-bottom.png" style="background-color: #000000 !important; background-image: url(https://clipershq.com/email-glow-bottom.png); background-repeat: no-repeat; background-position: center bottom; background-size: 100% auto; height: 120px; line-height: 120px; mso-line-height-rule: exactly; font-size: 1px;">
        &nbsp;
      </td>
    </tr>
    <!-- Footer logo lockup -->
    <tr style="background-color: #000000;">
      <td bgcolor="#000000" align="center" style="background-color: #000000 !important; padding: 8px 24px 4px;">
        ${lockup}
      </td>
    </tr>
    <!-- Copyright -->
    <tr style="background-color: #000000;">
      <td class="footer-bg" bgcolor="#000000" align="center" style="background-color: #000000 !important; padding: 12px 24px 32px;">
        <p style="color: #6b7280 !important; font-size: 12px; margin: 0; background-color: #000000 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">&copy; 2026 Clippers HQ &mdash; <a href="https://clipershq.com" style="color: #6b7280 !important; text-decoration: none; background-color: #000000 !important;">clipershq.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</div>
</body>
</html>`;
}

/** Centered button for emails (uses table for email client compatibility) */
function emailButton(text: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #111720 !important;">
<tr style="background-color: #111720;"><td class="btn-cell" align="center" style="border-radius: 8px; background-color: #2596be !important;">
  <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none; background-color: #2596be !important; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    ${text}
  </a>
</td></tr>
</table>`;
}

// ─── Email functions ─────────────────────────────────────────

export async function sendWelcomeEmail(email: string, username: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Welcome to Clippers HQ",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Hey ${escapeHtml(username)},</p>
      <p style="font-size: 15px; color: #a1a1aa; margin: 0 0 16px;">Welcome to Clippers HQ! Here's how to start earning:</p>
      <ol style="font-size: 14px; color: #d4d4d8; padding-left: 20px; margin: 0 0 16px;">
        <li style="margin-bottom: 8px;">Add your TikTok or Instagram account in <strong style="color: #fff;">Accounts</strong></li>
        <li style="margin-bottom: 8px;">Browse and join a <strong style="color: #fff;">Campaign</strong></li>
        <li style="margin-bottom: 8px;">Post clips and submit them in <strong style="color: #fff;">Clips</strong></li>
        <li>Earn money based on your views!</li>
      </ol>
      <p style="font-size: 14px; color: #71717a; margin: 0;">Good luck and happy clipping!</p>
    `),
  });
}

export async function sendClipApproved(email: string, campaignName: string, earnings: number): Promise<boolean> {
  return sendEmailWithRetry({
    to: email,
    subject: "Your clip was approved",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Great news!</p>
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">Your clip for <strong style="color: #fff;">${escapeHtml(campaignName)}</strong> has been approved.</p>
      ${earnings > 0 ? `<p style="font-size: 20px; color: #2596be; font-weight: bold; margin: 0 0 12px;">Current earnings: $${earnings.toFixed(2)}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Tracking has started — we'll monitor views and calculate your earnings automatically.</p>
    `),
  });
}

export async function sendClipRejected(email: string, campaignName: string, reason?: string): Promise<boolean> {
  return sendEmailWithRetry({
    to: email,
    subject: "Clip update",
    html: wrap(`
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">Your clip for <strong style="color: #fff;">${escapeHtml(campaignName)}</strong> was not approved.</p>
      ${reason ? `<p style="font-size: 14px; color: #f87171; margin: 0 0 12px;">Reason: ${escapeHtml(reason)}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Submit another clip to keep your streak going!</p>
    `),
  });
}

export async function sendPayoutApproved(email: string, amount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Payout sent",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Your payout has been sent.</p>
      <p style="font-size: 22px; color: #2596be; font-weight: bold; margin: 0 0 12px;">$${amount.toFixed(2)}</p>
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Check your wallet for the transfer. It may take a few business days to arrive.</p>
    `),
  });
}

export async function sendPayoutRejected(email: string, amount: number, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Payout update",
    html: wrap(`
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">Your payout request of <strong style="color: #fff;">$${amount.toFixed(2)}</strong> was not approved.</p>
      ${reason ? `<p style="font-size: 14px; color: #f87171; margin: 0 0 12px;">Reason: ${escapeHtml(reason)}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Contact us on Discord if you have questions.</p>
    `),
  });
}

export async function sendCallScheduled(email: string, amount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Verification call scheduled",
    html: wrap(`
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">A verification call has been scheduled for your payout of <strong style="color: #fff;">$${amount.toFixed(2)}</strong>.</p>
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Please select a time that works for you by visiting your Payouts page.</p>
    `),
  });
}

// Legacy exports (kept for backward compat with existing code)
export async function sendClipSubmitted(email: string, clipUrl: string): Promise<boolean> {
  return sendEmail({ to: email, subject: "Clip submitted", html: wrap(`<p style="font-size: 15px;">Your clip was submitted and is being reviewed.</p>`) });
}
export async function sendStreakWarning(email: string, currentStreak: number): Promise<boolean> {
  return sendEmail({ to: email, subject: "Don't lose your streak", html: wrap(`<p style="font-size: 15px;">Your ${currentStreak}-day streak is at risk. Submit a clip today!</p>`) });
}
export async function sendCampaignApproved(email: string, campaignName: string): Promise<boolean> {
  return sendEmail({ to: email, subject: `Campaign approved`, html: wrap(`<p style="font-size: 15px;">Your campaign <strong>${escapeHtml(campaignName)}</strong> is live.</p>`) });
}
export async function sendCampaignRejected(email: string, campaignName: string): Promise<boolean> {
  return sendEmail({ to: email, subject: `Campaign not approved`, html: wrap(`<p style="font-size: 15px;">Your campaign <strong>${escapeHtml(campaignName)}</strong> was not approved.</p>`) });
}
export async function sendCampaignAlertEmail(email: string, campaignName: string, description: string, campaignId?: string, cpm?: number, budget?: number): Promise<boolean> {
  const link = campaignId ? `https://clipershq.com/campaigns/${campaignId}` : "https://clipershq.com/campaigns";
  // If description is empty, just a number, or too short, use the default
  const desc = (description && description.trim().length > 3 && !/^\d+$/.test(description.trim()))
    ? description.trim()
    : "A new campaign is live and ready for clippers!";
  return sendEmail({
    to: email,
    subject: safeSubject(`New Campaign: ${campaignName}`),
    html: wrap(`
      <div style="text-align: center; padding: 8px 0 16px; background-color: #111720 !important;">
        <span style="font-size: 13px; color: #2596be !important; letter-spacing: 2px; text-transform: uppercase; background-color: #111720 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">New Campaign Available</span>
      </div>
      <h1 style="color: #ffffff !important; font-size: 26px; font-weight: 700; margin: 0 0 16px; text-align: center; background-color: #111720 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${escapeHtml(campaignName)}</h1>
      <p style="color: #a1a1aa !important; font-size: 15px; margin: 0 0 20px; text-align: center; background-color: #111720 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${escapeHtml(desc)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px; background-color: #0d1117 !important; border: 1px solid #1c2333; border-radius: 12px;">
        <tr style="background-color: #0d1117;">
          <td class="stats-cell" style="padding: 16px; text-align: center; border-right: 1px solid #1c2333; background-color: #0d1117 !important;">
            <p style="color: #6b7280 !important; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; background-color: #0d1117 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">CPM Rate</p>
            <p style="color: #2596be !important; font-size: 22px; font-weight: 700; margin: 0; background-color: #0d1117 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${cpm ? "$" + cpm.toFixed(2) : "\u2014"}</p>
          </td>
          <td class="stats-cell" style="padding: 16px; text-align: center; background-color: #0d1117 !important;">
            <p style="color: #6b7280 !important; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; background-color: #0d1117 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Budget</p>
            <p style="color: #10b981 !important; font-size: 22px; font-weight: 700; margin: 0; background-color: #0d1117 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${budget ? "$" + budget.toLocaleString() : "\u2014"}</p>
          </td>
        </tr>
      </table>
      <p style="color: #d4d4d8 !important; font-size: 14px; text-align: center; margin: 0 0 24px; background-color: #111720 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Check out the details and join when you're ready.</p>
      ${emailButton("View Campaign", link)}
    `),
  });
}

export async function sendReferralSignup(email: string, referredName: string): Promise<boolean> {
  return sendEmail({ to: email, subject: "New referral", html: wrap(`<p style="font-size: 15px;"><strong>${escapeHtml(referredName)}</strong> signed up with your link. You earn 5% of their earnings forever.</p>`) });
}

export async function sendPayoutReminder(email: string, campaignName: string, amount: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Payout reminder",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px; text-align: center; background-color: #111720 !important;">Payout Reminder</p>
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 16px; text-align: center; background-color: #111720 !important;">You have <strong style="color: #2596be;">${escapeHtml(amount)}</strong> unpaid from <strong style="color: #fff;">${escapeHtml(campaignName)}</strong>.</p>
      <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px; text-align: center; background-color: #111720 !important;">Please request your payout so we can process it.</p>
      ${emailButton("Go to Payouts", "https://clipershq.com/payouts")}
    `),
  });
}

export async function sendStreakRejectionWarning(email: string, campaignName: string, hoursLeft: number): Promise<boolean> {
  const h = Math.floor(hoursLeft);
  const m = Math.round((hoursLeft - h) * 60);
  const timeStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
  return sendEmail({
    to: email,
    subject: "Clip rejected — post again to save your streak!",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Your clip was rejected</p>
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">Your clip for <strong style="color: #fff;">${escapeHtml(campaignName)}</strong> was rejected.</p>
      <p style="font-size: 18px; color: #f59e0b; font-weight: bold; margin: 0 0 12px;">You have ${timeStr} left to post today to keep your streak!</p>
      <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px;">Submit a new clip now before the day ends.</p>
      ${emailButton("Submit a Clip", "https://clipershq.com/clips")}
    `),
  });
}

export async function sendConsecutiveRejectionWarning(email: string, rejectionCount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Multiple clips rejected — please review requirements",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Quality warning</p>
      <p style="font-size: 15px; color: #f87171; margin: 0 0 12px;"><strong>${rejectionCount} clips in a row</strong> have been rejected.</p>
      <p style="font-size: 14px; color: #d4d4d8; margin: 0 0 12px;">Please review the campaign requirements carefully before submitting more clips. Low quality submissions may result in account restrictions.</p>
      <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px;">Check the campaign page for detailed requirements and examples.</p>
      ${emailButton("View Campaigns", "https://clipershq.com/campaigns")}
    `),
  });
}

export async function sendChatReplyEmail(params: {
  to: string;
  recipientName: string;
  senderName: string;
  messagePreview: string;
  conversationUrl: string;
}): Promise<boolean> {
  const { to, recipientName, senderName, messagePreview, conversationUrl } = params;
  const esc = (s: string) =>
    String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c] || c);
  const preview = esc(messagePreview.slice(0, 200));
  const truncated = messagePreview.length > 200 ? "…" : "";
  const safeSender = esc(senderName);
  const safeRecipient = esc(recipientName);
  return sendEmailWithRetry({
    to,
    subject: `New message from ${safeSender} — Clippers HQ`,
    html: wrap(`
      <p style="font-size: 13px; color: #a1a1aa !important; margin: 0 0 8px; background-color: #111720 !important;">New message in your support chat</p>
      <p style="font-size: 16px; margin: 0 0 12px; background-color: #111720 !important;">Hi ${safeRecipient},</p>
      <p style="font-size: 15px; color: #d4d4d8 !important; margin: 0 0 16px; background-color: #111720 !important;"><strong style="color: #ffffff !important;">${safeSender}</strong> replied to your conversation:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117 !important; border-left: 3px solid #2596be; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
        <tr style="background-color: #0d1117;"><td style="padding: 12px 16px; background-color: #0d1117 !important;">
          <p style="margin: 0; color: #d4d4d8 !important; font-size: 14px; font-style: italic; background-color: #0d1117 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">&ldquo;${preview}${truncated}&rdquo;</p>
        </td></tr>
      </table>
      ${emailButton("Reply now", conversationUrl)}
      <p style="font-size: 12px; color: #71717a !important; margin: 24px 0 0; text-align: center; background-color: #111720 !important;">If you didn&rsquo;t expect this email, you can safely ignore it.</p>
    `),
  });
}

export async function sendClientInviteEmail(email: string, link: string): Promise<boolean> {
  return sendEmailWithRetry({
    to: email,
    subject: "You're invited to view your campaign on Clippers HQ",
    html: wrap(`
      <p style="font-size: 18px; font-weight: bold; margin: 0 0 16px; color: #2596be;">You've been invited</p>
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">You've been invited to view your campaign performance on Clippers HQ.</p>
      <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px;">Click the button below to access your dashboard. This link expires in 24 hours.</p>
      ${emailButton("Access Dashboard", link)}
      <p style="font-size: 12px; color: #71717a; margin: 24px 0 0;">If you didn't expect this email, you can safely ignore it.</p>
    `),
  });
}
