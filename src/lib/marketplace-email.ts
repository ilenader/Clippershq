/**
 * Phase 9 — Marketplace transactional email senders.
 *
 * Modeled exactly on src/lib/community-email.ts:
 *   - Self-contained Resend POST + 2-second retry helper.
 *   - Imports wrap + emailButton + escapeHtml from src/lib/email.ts so all
 *     marketplace mail shares the same dark/light-aware chrome.
 *   - Falls back to console preview when EMAIL_API_KEY is unset.
 *   - Every sender returns boolean so callers can audit success.
 *   - Every sender guards against missing recipient email and no-ops.
 *   - All bodies use escapeHtml() on every dynamic value (XSS guard).
 *   - Hardcoded clipershq.com URLs match the convention in email.ts.
 *
 * Privacy: callers must pass PUBLIC handles only (username, clipAccount.username).
 * Never pass user.email or other PII as display fields — these are addressed
 * envelopes for the recipient, not relays of the other party's identity.
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
    if (!apiKey) console.log(`[MKT EMAIL PREVIEW] To: ${params.to} | Subject: ${params.subject}`);
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

function safeSubject(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

// Shared CTA URLs — single source of truth so a domain change later doesn't
// require touching every sender. Matches the hardcoded https://clipershq.com
// convention in src/lib/email.ts.
const URLS = {
  marketplace: "https://clipershq.com/marketplace",
  incoming: "https://clipershq.com/marketplace/incoming",
  mySubmissions: "https://clipershq.com/marketplace/my-submissions",
  browse: "https://clipershq.com/marketplace/browse",
};

// Common one-paragraph + CTA template. Keeps every sender visually
// consistent and avoids drift on margins/sizes.
function paragraph(text: string): string {
  return `<p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 20px;">${text}</p>`;
}
function lead(text: string): string {
  return `<p style="font-size: 16px; color: #000000 !important; margin: 0 0 12px;">${text}</p>`;
}
function eyebrow(text: string): string {
  return `<p class="accent-blue" style="font-size: 13px; color: #2596be !important; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 12px;">${text}</p>`;
}
function reasonPanel(reason: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(239, 68, 68, 0.08) !important; border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 12px; margin: 0 0 20px;"><tr><td style="padding: 14px 18px; background-color: rgba(239, 68, 68, 0.08) !important;"><p class="warn-panel" style="font-size: 14px; color: #b91c1c !important; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Reason: ${escapeHtml(reason)}</p></td></tr></table>`;
}

// ─── 1. New submission → poster ──────────────────────────────

export async function sendMarketplaceNewSubmission(params: {
  to: string;
  posterUsername: string;
  creatorUsername: string;
  accountUsername: string;
  campaignName: string;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername, creatorUsername, accountUsername, campaignName } = params;
  return resendWithRetry({
    to,
    subject: safeSubject(`New submission from @${creatorUsername} on @${accountUsername}`),
    html: wrap(`
      ${eyebrow("New marketplace submission")}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph(`<strong style="color: #000000 !important;">@${escapeHtml(creatorUsername)}</strong> just submitted a clip to your listing on <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong> for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong>. Review it now to approve or reject within 24h.`)}
      ${emailButton("Review submission", URLS.incoming)}
    `),
  });
}

// ─── 2. Submission approved → creator ────────────────────────

export async function sendMarketplaceSubmissionApproved(params: {
  to: string;
  creatorUsername: string;
  accountUsername: string;
  campaignName: string;
  postDeadlineISO: string;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, creatorUsername, accountUsername, campaignName, postDeadlineISO } = params;
  return resendWithRetry({
    to,
    subject: safeSubject("Your submission was approved!"),
    html: wrap(`
      ${eyebrow("Submission approved")}
      ${lead(`Hey ${escapeHtml(creatorUsername)},`)}
      ${paragraph(`Your clip submitted to <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong> for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> was approved.`)}
      ${paragraph(`You have <strong style="color: #000000 !important;">24 hours</strong> to post it on your social and mark it as posted in the dashboard. Deadline: ${escapeHtml(postDeadlineISO)}.`)}
      ${emailButton("Post your clip", URLS.mySubmissions)}
    `),
  });
}

// ─── 3. Submission rejected → creator ────────────────────────

export async function sendMarketplaceSubmissionRejected(params: {
  to: string;
  creatorUsername: string;
  accountUsername: string;
  campaignName: string;
  reason: string;
  improvementNote?: string | null;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, creatorUsername, accountUsername, campaignName, reason, improvementNote } = params;
  const noteBlock = improvementNote && improvementNote.trim().length > 0
    ? paragraph(`<strong style="color: #000000 !important;">How to improve:</strong> ${escapeHtml(improvementNote)}`)
    : "";
  return resendWithRetry({
    to,
    subject: safeSubject("Your submission was not approved"),
    html: wrap(`
      ${eyebrow("Submission rejected")}
      ${lead(`Hey ${escapeHtml(creatorUsername)},`)}
      ${paragraph(`Your clip submitted to <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong> for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> was not approved.`)}
      ${reasonPanel(reason)}
      ${noteBlock}
      ${paragraph("Don't sweat it — browse other listings and submit a new clip to keep things moving.")}
      ${emailButton("Browse other listings", URLS.browse)}
    `),
  });
}

// ─── 4. Listing approved → poster ────────────────────────────

export async function sendMarketplaceListingApproved(params: {
  to: string;
  posterUsername: string;
  accountUsername: string;
  campaignName: string;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername, accountUsername, campaignName } = params;
  return resendWithRetry({
    to,
    subject: safeSubject("Your marketplace listing is live"),
    html: wrap(`
      ${eyebrow("Listing approved")}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph(`Your listing for <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong> on <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> is now active. Creators can see it and submit clips.`)}
      ${emailButton("View listing", URLS.marketplace)}
    `),
  });
}

// ─── 5. Listing rejected → poster ────────────────────────────

export async function sendMarketplaceListingRejected(params: {
  to: string;
  posterUsername: string;
  accountUsername: string;
  campaignName: string;
  reason: string;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername, accountUsername, campaignName, reason } = params;
  return resendWithRetry({
    to,
    subject: safeSubject("Your listing was not approved"),
    html: wrap(`
      ${eyebrow("Listing rejected")}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph(`Your listing for <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong> on <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> was not approved.`)}
      ${reasonPanel(reason)}
      ${paragraph("Address the feedback above and submit a new listing when you're ready.")}
      ${emailButton("Try again", URLS.marketplace)}
    `),
  });
}

// ─── 6. Post deadline reminder → poster ──────────────────────
// Recipient is the listing owner (poster). Targeting matches the dormant
// reminder rows in marketplace-timers.ts step E (userId: posterId).

export async function sendMarketplacePostDeadlineReminder(params: {
  to: string;
  posterUsername: string;
  accountUsername: string;
  campaignName: string;
  hoursLeft: number;
  reminderType: "12H" | "6H" | "1H";
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername, accountUsername, campaignName, hoursLeft, reminderType } = params;

  // Urgency scales with reminderType. 1H is the strongest tone — strike risk
  // is imminent if the poster doesn't act.
  const urgencyCopy =
    reminderType === "1H"
      ? "This is your final reminder. Post it within the hour to avoid a strike."
      : reminderType === "6H"
      ? "Time is running out. Post the clip soon to avoid missing the deadline."
      : "Plenty of time left, but don't forget — get the clip up to keep your record clean.";

  return resendWithRetry({
    to,
    subject: safeSubject(`Post your clip — ${hoursLeft}h remaining`),
    html: wrap(`
      ${eyebrow(`${reminderType} reminder`)}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph(`You have an approved marketplace clip for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> waiting to be posted on <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong>.`)}
      ${paragraph(`<strong style="color: #000000 !important;">About ${hoursLeft}h left</strong> until the post deadline. ${escapeHtml(urgencyCopy)}`)}
      ${emailButton("Mark as posted", URLS.incoming)}
    `),
  });
}

// ─── 7. Post deadline missed → poster (with strike) ──────────
// Recipient is the poster; body references the strike count because only
// posters accumulate strikes in the marketplace ban system.

export async function sendMarketplacePostDeadlineMissed(params: {
  to: string;
  posterUsername: string;
  accountUsername: string;
  campaignName: string;
  strikeCount: number;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername, accountUsername, campaignName, strikeCount } = params;
  return resendWithRetry({
    to,
    subject: safeSubject("Post deadline passed"),
    html: wrap(`
      ${eyebrow("Strike issued")}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph(`Your approved submission for <strong style="color: #000000 !important;">@${escapeHtml(accountUsername)}</strong> on <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> expired without being posted.`)}
      ${reasonPanel(`Strike ${strikeCount}/3 issued. Three strikes within 30 days triggers a 48-hour marketplace ban.`)}
      ${emailButton("View dashboard", URLS.marketplace)}
    `),
  });
}

// ─── 8. Marketplace ban issued → poster ──────────────────────

export async function sendMarketplaceBanned(params: {
  to: string;
  posterUsername: string;
  until: string;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername, until } = params;
  return resendWithRetry({
    to,
    subject: safeSubject("Marketplace ban — 48 hours"),
    html: wrap(`
      ${eyebrow("Marketplace banned")}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph(`You've received <strong style="color: #000000 !important;">3 strikes within 30 days</strong>. Your marketplace access is paused for the next 48 hours.`)}
      ${reasonPanel(`Ban expires: ${until}. Your active listings are paused for the duration and will resume automatically.`)}
      ${emailButton("View dashboard", URLS.marketplace)}
    `),
  });
}

// ─── 9. Marketplace ban lifted → poster ──────────────────────

export async function sendMarketplaceBanLifted(params: {
  to: string;
  posterUsername: string;
}): Promise<boolean> {
  if (!params.to) return false;
  const { to, posterUsername } = params;
  return resendWithRetry({
    to,
    subject: safeSubject("Marketplace ban lifted"),
    html: wrap(`
      ${eyebrow("Ban lifted")}
      ${lead(`Hey ${escapeHtml(posterUsername)},`)}
      ${paragraph("Your marketplace access has been restored. Your listings are active again — you can submit clips and review submissions.")}
      ${emailButton("Open marketplace", URLS.marketplace)}
    `),
  });
}
