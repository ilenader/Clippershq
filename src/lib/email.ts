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

async function sendEmail(params: EmailParams): Promise<boolean> {
  const apiKey = process.env.EMAIL_API_KEY || "";
  const from = process.env.EMAIL_FROM || "Clippers HQ <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[EMAIL PREVIEW] To: ${params.to} | Subject: ${params.subject}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    if (res.ok) {
      console.log(`[EMAIL OK] Sent to ${params.to}`);
    } else {
      console.error(`[EMAIL FAIL] ${res.status}`);
    }
    return res.ok;
  } catch (err) {
    console.error("[EMAIL ERROR]", err);
    return false;
  }
}

// ─── Template wrapper ────────────────────────────────────────

function wrap(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #09090b; border-radius: 16px; overflow: hidden;">
      <div style="padding: 24px 24px 16px; text-align: center; border-bottom: 1px solid #1c1c20;">
        <h2 style="color: #2596be; font-size: 22px; margin: 0; letter-spacing: 1px;">CLIPPERS HQ</h2>
      </div>
      <div style="padding: 24px; color: #e4e4e7;">
        ${content}
      </div>
      <div style="padding: 16px 24px; border-top: 1px solid #1c1c20; text-align: center;">
        <p style="color: #52525b; font-size: 12px; margin: 0;">&copy; 2026 Clippers HQ &mdash; clipershq.com</p>
      </div>
    </div>
  `;
}

// ─── Email functions ─────────────────────────────────────────

export async function sendWelcomeEmail(email: string, username: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Welcome to Clippers HQ",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Hey ${username},</p>
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
  return sendEmail({
    to: email,
    subject: "Your clip was approved!",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Great news!</p>
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">Your clip for <strong style="color: #fff;">${campaignName}</strong> has been approved.</p>
      ${earnings > 0 ? `<p style="font-size: 20px; color: #2596be; font-weight: bold; margin: 0 0 12px;">Current earnings: $${earnings.toFixed(2)}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Tracking has started — we'll monitor views and calculate your earnings automatically.</p>
    `),
  });
}

export async function sendClipRejected(email: string, campaignName: string, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Clip update",
    html: wrap(`
      <p style="font-size: 15px; color: #d4d4d8; margin: 0 0 12px;">Your clip for <strong style="color: #fff;">${campaignName}</strong> was not approved.</p>
      ${reason ? `<p style="font-size: 14px; color: #f87171; margin: 0 0 12px;">Reason: ${reason}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa; margin: 0;">Submit another clip to keep your streak going!</p>
    `),
  });
}

export async function sendPayoutApproved(email: string, amount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Payout sent!",
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">Your payout has been sent!</p>
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
      ${reason ? `<p style="font-size: 14px; color: #f87171; margin: 0 0 12px;">Reason: ${reason}</p>` : ""}
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
  return sendEmail({ to: email, subject: "Don't lose your streak!", html: wrap(`<p style="font-size: 15px;">Your ${currentStreak}-day streak is at risk. Submit a clip today!</p>`) });
}
export async function sendCampaignApproved(email: string, campaignName: string): Promise<boolean> {
  return sendEmail({ to: email, subject: `Campaign approved`, html: wrap(`<p style="font-size: 15px;">Your campaign <strong>${campaignName}</strong> is live.</p>`) });
}
export async function sendCampaignRejected(email: string, campaignName: string): Promise<boolean> {
  return sendEmail({ to: email, subject: `Campaign not approved`, html: wrap(`<p style="font-size: 15px;">Your campaign <strong>${campaignName}</strong> was not approved.</p>`) });
}
export async function sendCampaignAlertEmail(email: string, campaignName: string, description: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `New Campaign: ${campaignName}`,
    html: wrap(`
      <p style="font-size: 16px; margin: 0 0 12px;">🎬 New Campaign Alert!</p>
      <p style="font-size: 18px; color: #fff; font-weight: bold; margin: 0 0 12px;">${campaignName}</p>
      <p style="font-size: 15px; color: #a1a1aa; margin: 0 0 20px;">${description}</p>
      <a href="https://clipershq.com/login" style="display: inline-block; background: #0095f6; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Start Clipping Now</a>
    `),
  });
}

export async function sendReferralSignup(email: string, referredName: string): Promise<boolean> {
  return sendEmail({ to: email, subject: "New referral!", html: wrap(`<p style="font-size: 15px;"><strong>${referredName}</strong> signed up with your link. You earn 5% of their earnings forever.</p>`) });
}
