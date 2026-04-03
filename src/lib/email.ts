/**
 * Email service abstraction.
 *
 * Currently prepared for Resend or any HTTP email provider.
 * All templates are ready. To activate:
 *   1. Set EMAIL_API_KEY in .env.local
 *   2. Set EMAIL_FROM in .env.local (e.g. "Clippers HQ <noreply@clippershq.com>")
 *   3. Install `resend` package: npm i resend
 *
 * Until then, emails are logged to console but not sent.
 */

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(params: EmailParams): Promise<boolean> {
  // Read env at call time (not module load time) so hot reload picks up changes
  const apiKey = process.env.EMAIL_API_KEY || "";
  const from = process.env.EMAIL_FROM || "Clippers HQ <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[EMAIL PREVIEW] To: ${params.to} | Subject: ${params.subject}`);
    return false;
  }

  try {
    console.log(`[EMAIL] Sending to: ${params.to} | Subject: ${params.subject} | From: ${from}`);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    const resBody = await res.text();
    if (res.ok) {
      console.log(`[EMAIL OK] Sent to ${params.to} — ${resBody}`);
    } else {
      console.error(`[EMAIL FAIL] ${res.status} — ${resBody}`);
    }
    return res.ok;
  } catch (err) {
    console.error("[EMAIL ERROR]", err);
    return false;
  }
}

// ─── Templates ──────────────────────────────────────────────

function wrap(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background: #09090b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #fff; font-size: 20px; margin: 0;">CLIPPERS HQ</h2>
      </div>
      ${content}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #232327; text-align: center;">
        <p style="color: #71717a; font-size: 12px; margin: 0;">Clippers HQ — Your clipping platform</p>
      </div>
    </div>
  `;
}

export async function sendClipSubmitted(email: string, clipUrl: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Clip submitted successfully",
    html: wrap(`
      <p style="font-size: 15px;">Thanks for submitting your clip.</p>
      <p style="font-size: 14px; color: #a1a1aa;">We'll review it within approximately 24 hours.</p>
      <p style="font-size: 13px; color: #71717a; margin-top: 16px;">${clipUrl}</p>
    `),
  });
}

export async function sendClipApproved(email: string, earnings: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Your clip was approved!",
    html: wrap(`
      <p style="font-size: 15px;">Great news — your clip has been approved.</p>
      ${earnings > 0 ? `<p style="font-size: 18px; color: #22c55e; font-weight: bold;">Earnings: $${earnings.toFixed(2)}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa;">Keep posting to build your streak and earn more.</p>
    `),
  });
}

export async function sendClipRejected(email: string, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Clip review update",
    html: wrap(`
      <p style="font-size: 15px;">Your clip was not approved this time.</p>
      ${reason ? `<p style="font-size: 14px; color: #f87171;">Reason: ${reason}</p>` : ""}
      <p style="font-size: 14px; color: #a1a1aa;">Review the campaign requirements and try again.</p>
    `),
  });
}

export async function sendStreakWarning(email: string, currentStreak: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Don't lose your streak!",
    html: wrap(`
      <p style="font-size: 15px;">You have a <strong>${currentStreak}-day streak</strong>.</p>
      <p style="font-size: 14px; color: #fb923c;">Submit a clip today to keep it alive!</p>
      <p style="font-size: 13px; color: #a1a1aa;">Missing a day resets your streak bonus to 0%.</p>
    `),
  });
}

export async function sendCampaignApproved(email: string, campaignName: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Campaign "${campaignName}" approved`,
    html: wrap(`
      <p style="font-size: 15px;">Your campaign <strong>${campaignName}</strong> has been approved and is now live.</p>
      <p style="font-size: 14px; color: #a1a1aa;">Clippers can now join and submit clips.</p>
    `),
  });
}

export async function sendCampaignRejected(email: string, campaignName: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Campaign "${campaignName}" not approved`,
    html: wrap(`
      <p style="font-size: 15px;">Your campaign <strong>${campaignName}</strong> was not approved.</p>
      <p style="font-size: 14px; color: #a1a1aa;">Review the feedback and resubmit.</p>
    `),
  });
}

export async function sendReferralSignup(email: string, referredName: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Someone signed up with your referral!",
    html: wrap(`
      <p style="font-size: 15px;"><strong>${referredName}</strong> just signed up using your referral link.</p>
      <p style="font-size: 14px; color: #22c55e;">You'll earn 5% of their approved earnings — forever.</p>
    `),
  });
}
