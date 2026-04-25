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

export function wrap(content: string): string {
  // INVERTED DEFAULT: white surface is the default render — Gmail iOS strips most
  // CSS overrides and forces white anyway, so we make white the ground truth and
  // let Gmail web dark-mode (via [data-ogsc] wrappers) and Apple Mail dark-mode
  // (via prefers-color-scheme: dark) flip back to the dark variant. Templates
  // carry inline color: #000000 / #4a5568 / #6b7280 by default; the dark-mode
  // blocks below use body-prefixed selectors to beat inline !important via
  // specificity and re-pin to white-on-black for dark-mode clients.
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" style="background-color: #ffffff;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Clippers HQ</title>
<style type="text/css">
  /* HARD RESET — first rules in the cascade so Gmail iOS Mail honors them even
     when it ignores nested overrides further down. White is the new default. */
  body, html { background: #ffffff !important; background-color: #ffffff !important; color: #000000 !important; }
  table, tr, td { background-color: #ffffff !important; }
  .content-cell, .content-cell * { background-color: transparent !important; }
  .content-cell { background: #ffffff !important; background-color: #ffffff !important; color: #000000 !important; }
  .content-cell .accent-blue { color: #2596be !important; }
  .content-cell .muted { color: #4a5568 !important; }
  .content-cell .footnote { color: #6b7280 !important; }
  /* Re-pin under @media only screen — Gmail iOS scopes some rules to media queries. */
  @media only screen {
    body, table, td, .content-cell { background: #ffffff !important; background-color: #ffffff !important; }
    .content-cell, .content-cell p, .content-cell span, .content-cell strong,
    .content-cell b, .content-cell li, .content-cell h1, .content-cell h2, .content-cell h3 {
      color: #000000 !important;
    }
    .content-cell .accent-blue { color: #2596be !important; }
    .content-cell .muted { color: #4a5568 !important; }
    .content-cell .footnote { color: #6b7280 !important; }
  }
  :root {
    color-scheme: light dark;
    supported-color-schemes: light dark;
  }
  /* By default the dark-themed slices are hidden — only the white variant renders.
     The dark-mode triggers below (prefers-color-scheme: dark + [data-ogsc] wrappers)
     flip visibility for dark-mode clients. */
  .dark-mode-only { display: none !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all; }
  body, html, table, td, div, p, span, h1, h2, h3, ol, li, a {
    background-color: #ffffff !important;
    color: #000000;
  }
  .inner-box, .inner-box td { background-color: #ffffff !important; }
  .body-bg { background-color: #ffffff !important; }
  .footer-bg { background-color: #ffffff !important; }
  .stats-cell { background-color: rgba(0, 0, 0, 0.04) !important; }
  .btn-cell { background-color: #2596be !important; }
  /* Carve-outs — keep button blue + stats panel + warning panels intact on white. */
  .content-cell .stats-cell { background-color: rgba(0, 0, 0, 0.04) !important; }
  .content-cell .btn-cell, .content-cell .btn-cell a { background-color: #2596be !important; color: #ffffff !important; }
  .content-cell .warn-panel { background-color: rgba(239, 68, 68, 0.08) !important; }
  .content-cell .warn-panel p { color: #b91c1c !important; }
  /* Inline content links use brand blue. Override below keeps CTA button text white. */
  a { color: #2596be !important; text-decoration: underline; }
  a:hover { color: #1f7a9c !important; }
  .btn-cell a { background-color: #2596be !important; color: #ffffff !important; text-decoration: none !important; }
  /* Apple Mail dark mode (Mac in dark theme + any client respecting prefers-color-scheme: dark).
     Flips the white default back to dark theme. body-prefix selectors beat inline !important. */
  @media (prefers-color-scheme: dark) {
    body, html { background-color: #000000 !important; color: #ffffff !important; }
    .body-bg { background-color: #000000 !important; }
    body table, body tr, body td { background-color: #000000 !important; }
    .inner-box, .inner-box td { background-color: #000000 !important; }
    .footer-bg { background-color: #000000 !important; }
    /* Show dark slices, hide white slices */
    .dark-mode-only { display: block !important; max-height: none !important; overflow: visible !important; }
    .default-light { display: none !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all; }
    /* Content surface — BLACK bg, WHITE text. body-prefix beats inline !important. */
    body .content-cell { background-color: #000000 !important; background: #000000 !important; color: #ffffff !important; }
    body .content-cell * { background-color: transparent !important; }
    body .content-cell p, body .content-cell div, body .content-cell li,
    body .content-cell span, body .content-cell strong, body .content-cell b,
    body .content-cell h1, body .content-cell h2, body .content-cell h3 { color: #ffffff !important; }
    body .content-cell .accent-blue, body .content-cell .accent-blue * { color: #2596be !important; }
    body .content-cell .muted { color: #c8d0d8 !important; }
    body .content-cell .footnote { color: #6b7280 !important; }
    body .content-cell .stats-cell { background-color: rgba(255, 255, 255, 0.04) !important; }
    body .content-cell .btn-cell, body .content-cell .btn-cell a { background-color: #2596be !important; color: #ffffff !important; }
    body .content-cell .warn-panel { background-color: rgba(239, 68, 68, 0.08) !important; }
    body .content-cell .warn-panel p { color: #fca5a5 !important; }
    .footer-bg p, .footer-bg a { color: #6b7280 !important; }
  }
  /* Gmail web / Outlook.com dark mode — [data-ogsc] (light source) and [data-ogsb]
     (background source) are the wrappers Gmail/Outlook inject when forcing dark
     inversion. Mirror the prefers-color-scheme: dark block to flip to dark theme. */
  [data-ogsc] body, [data-ogsb] body { background-color: #000000 !important; color: #ffffff !important; }
  [data-ogsc] .body-bg, [data-ogsb] .body-bg { background-color: #000000 !important; }
  [data-ogsc] table, [data-ogsb] table { background-color: #000000 !important; }
  [data-ogsc] td, [data-ogsb] td { background-color: #000000 !important; }
  [data-ogsc] .footer-bg, [data-ogsb] .footer-bg { background-color: #000000 !important; }
  [data-ogsc] .default-light, [data-ogsb] .default-light { display: none !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all; }
  [data-ogsc] .dark-mode-only, [data-ogsb] .dark-mode-only { display: block !important; max-height: none !important; overflow: visible !important; }
  [data-ogsc] .content-cell, [data-ogsb] .content-cell { background-color: #000000 !important; background: #000000 !important; color: #ffffff !important; }
  [data-ogsc] .content-cell *, [data-ogsb] .content-cell * { background-color: transparent !important; }
  [data-ogsc] .content-cell p, [data-ogsb] .content-cell p,
  [data-ogsc] .content-cell div, [data-ogsb] .content-cell div,
  [data-ogsc] .content-cell li, [data-ogsb] .content-cell li,
  [data-ogsc] .content-cell span, [data-ogsb] .content-cell span,
  [data-ogsc] .content-cell strong, [data-ogsb] .content-cell strong,
  [data-ogsc] .content-cell b, [data-ogsb] .content-cell b,
  [data-ogsc] .content-cell h1, [data-ogsb] .content-cell h1,
  [data-ogsc] .content-cell h2, [data-ogsb] .content-cell h2,
  [data-ogsc] .content-cell h3, [data-ogsb] .content-cell h3 { color: #ffffff !important; }
  [data-ogsc] .content-cell .accent-blue, [data-ogsb] .content-cell .accent-blue,
  [data-ogsc] .content-cell .accent-blue *, [data-ogsb] .content-cell .accent-blue * { color: #2596be !important; }
  [data-ogsc] .content-cell .muted, [data-ogsb] .content-cell .muted { color: #c8d0d8 !important; }
  [data-ogsc] .content-cell .footnote, [data-ogsb] .content-cell .footnote { color: #6b7280 !important; }
  [data-ogsc] .content-cell .stats-cell, [data-ogsb] .content-cell .stats-cell { background-color: rgba(255, 255, 255, 0.04) !important; }
  [data-ogsc] .content-cell .btn-cell, [data-ogsb] .content-cell .btn-cell { background-color: #2596be !important; }
  [data-ogsc] .content-cell .btn-cell a, [data-ogsb] .content-cell .btn-cell a { color: #ffffff !important; }
  [data-ogsc] .content-cell .warn-panel, [data-ogsb] .content-cell .warn-panel { background-color: rgba(239, 68, 68, 0.08) !important; }
  [data-ogsc] .content-cell .warn-panel p, [data-ogsb] .content-cell .warn-panel p { color: #fca5a5 !important; }
  [data-ogsc] .footer-bg p, [data-ogsb] .footer-bg p,
  [data-ogsc] .footer-bg a, [data-ogsb] .footer-bg a { color: #6b7280 !important; }
  /* Apple Mail data-detector autostyling — never let it color-bomb our copy */
  body .content-cell a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  /* iOS Mail blue-link autodetection — disable */
  u + .body { background-color: #ffffff !important; }
  u + #body a { color: #2596be !important; text-decoration: underline; }
  /* Mobile — card fills viewport, glow images scale proportionally. */
  @media only screen and (max-width: 600px) {
    .email-card { width: 100% !important; max-width: 100% !important; }
    .top-glow-img, .bottom-glow-img, .top-glow-img-white, .bottom-glow-img-white { width: 100% !important; height: auto !important; }
    .px-mobile { padding: 16px 24px 24px !important; }
  }
</style>
</head>
<body bgcolor="#ffffff" id="body" class="body-bg" style="margin: 0; padding: 0; background-color: #ffffff !important; background: #ffffff !important; color: #000000 !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; min-height: 100vh;">
<!-- Hidden preheader. Zero-width joiners pad whitespace so Gmail won't preview body content. -->
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #ffffff;">&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>
<!-- FULL-WIDTH WHITE WRAPPER. min-width:100% prevents Gmail web from showing a frame
     around the 600px card on wide viewports. Dark mode CSS flips this to black. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" class="body-bg" style="background-color: #ffffff !important; min-width: 100%;">
<tr>
  <td align="center" valign="top" bgcolor="#ffffff" class="body-bg" style="background-color: #ffffff !important; padding: 16px 0;">

    <!-- Inner card 600px max — content auto-sizes height. -->
    <table class="inner-box email-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width: 600px; width: 100%; background-color: #ffffff !important;">

      <!-- Top slice. WHITE variant is the default render; dark-mode triggers swap to BLACK
           variant via display toggle on .default-light / .dark-mode-only divs. -->
      <tr>
        <td bgcolor="#ffffff" align="center" style="background-color: #ffffff !important; padding: 0; line-height: 0; font-size: 0; mso-line-height-rule: exactly;">
          <div class="default-light">
            <img src="https://clipershq.com/email-bg-top.png" width="600" height="180" alt="Clippers HQ" border="0" class="top-glow-img" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; outline: none; text-decoration: none;" />
          </div>
          <div class="dark-mode-only" style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
            <img src="https://clipershq.com/email-bg-top-white.png" width="600" height="180" alt="Clippers HQ" border="0" class="top-glow-img-white" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; outline: none; text-decoration: none;" />
          </div>
        </td>
      </tr>

      <!-- Content cell — WHITE bg + BLACK text by default. Dark-mode CSS flips to black/white. -->
      <tr>
        <td bgcolor="#ffffff" class="content-cell px-mobile" style="background-color: #ffffff !important; background: #ffffff !important; padding: 24px 32px 32px; color: #000000 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; mso-line-height-rule: exactly;">
          ${content}
        </td>
      </tr>

      <!-- Copyright -->
      <tr>
        <td class="footer-bg" bgcolor="#ffffff" align="center" style="background-color: #ffffff !important; padding: 0 24px 12px;">
          <p style="color: #6b7280 !important; font-size: 12px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">&copy; 2026 Clippers HQ &mdash; <a href="https://clipershq.com" style="color: #6b7280 !important; text-decoration: none;">clipershq.com</a></p>
        </td>
      </tr>

      <!-- Bottom slice — same default-white / dark-mode-black pair. -->
      <tr>
        <td bgcolor="#ffffff" align="center" style="background-color: #ffffff !important; padding: 0; line-height: 0; font-size: 0; mso-line-height-rule: exactly;">
          <div class="default-light">
            <img src="https://clipershq.com/email-bg-bottom.png" width="600" height="150" alt="Clippers HQ" border="0" class="bottom-glow-img" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; outline: none; text-decoration: none;" />
          </div>
          <div class="dark-mode-only" style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
            <img src="https://clipershq.com/email-bg-bottom-white.png" width="600" height="150" alt="Clippers HQ" border="0" class="bottom-glow-img-white" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; outline: none; text-decoration: none;" />
          </div>
        </td>
      </tr>

    </table>
  </td>
</tr>
</table>
</body>
</html>`;
}

/** Centered button for emails (uses table for email client compatibility).
 *  Wrapper bg is transparent so no dark halo appears around rounded corners on the
 *  pure-black chrome. Only the .btn-cell carries the brand accent. */
export function emailButton(text: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: transparent !important;">
<tr style="background-color: transparent;"><td class="btn-cell" bgcolor="#2596be" align="center" style="border-radius: 8px; background-color: #2596be !important;">
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
      <p style="font-size: 16px; color: #000000 !important; margin: 0 0 12px;">Hey ${escapeHtml(username)},</p>
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 20px;">Welcome to Clippers HQ! Here's how to start earning:</p>
      <ol style="font-size: 14px; color: #4a5568 !important; padding-left: 20px; margin: 0 0 20px; line-height: 1.6;">
        <li style="margin-bottom: 8px;">Add your TikTok or Instagram account in <strong style="color: #000000 !important;">Accounts</strong></li>
        <li style="margin-bottom: 8px;">Browse and join a <strong style="color: #000000 !important;">Campaign</strong></li>
        <li style="margin-bottom: 8px;">Post clips and submit them in <strong style="color: #000000 !important;">Clips</strong></li>
        <li>Earn money based on your views!</li>
      </ol>
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0;">Good luck and happy clipping!</p>
    `),
  });
}

export async function sendClipApproved(email: string, campaignName: string, earnings: number): Promise<boolean> {
  return sendEmailWithRetry({
    to: email,
    subject: "Your clip was approved",
    html: wrap(`
      <p style="font-size: 16px; color: #000000 !important; margin: 0 0 12px;">Great news!</p>
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 16px;">Your clip for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> has been approved.</p>
      ${earnings > 0 ? `<p class="accent-blue" style="font-size: 22px; color: #2596be !important; font-weight: 700; margin: 0 0 16px;">Current earnings: $${earnings.toFixed(2)}</p>` : ""}
      <p class="footnote" style="font-size: 14px; color: #6b7280 !important; margin: 0;">Tracking has started — we'll monitor views and calculate your earnings automatically.</p>
    `),
  });
}

export async function sendClipRejected(email: string, campaignName: string, reason?: string): Promise<boolean> {
  return sendEmailWithRetry({
    to: email,
    subject: "Clip update",
    html: wrap(`
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 16px;">Your clip for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> was not approved.</p>
      ${reason ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(239, 68, 68, 0.08) !important; border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 12px; margin: 0 0 16px;"><tr><td style="padding: 14px 18px; background-color: rgba(239, 68, 68, 0.08) !important;"><p class="warn-panel" style="font-size: 14px; color: #b91c1c !important; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Reason: ${escapeHtml(reason)}</p></td></tr></table>` : ""}
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0;">Submit another clip to keep your streak going!</p>
    `),
  });
}

export async function sendPayoutApproved(email: string, amount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Payout sent",
    html: wrap(`
      <p style="font-size: 16px; color: #000000 !important; margin: 0 0 12px;">Your payout has been sent.</p>
      <p class="accent-blue" style="font-size: 28px; color: #2596be !important; font-weight: 700; line-height: 1.2; margin: 0 0 16px;">$${amount.toFixed(2)}</p>
      <p class="footnote" style="font-size: 14px; color: #6b7280 !important; margin: 0;">Check your wallet for the transfer. It may take a few business days to arrive.</p>
    `),
  });
}

export async function sendPayoutRejected(email: string, amount: number, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Payout update",
    html: wrap(`
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 16px;">Your payout request of <strong style="color: #000000 !important;">$${amount.toFixed(2)}</strong> was not approved.</p>
      ${reason ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(239, 68, 68, 0.08) !important; border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 12px; margin: 0 0 16px;"><tr><td style="padding: 14px 18px; background-color: rgba(239, 68, 68, 0.08) !important;"><p class="warn-panel" style="font-size: 14px; color: #b91c1c !important; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Reason: ${escapeHtml(reason)}</p></td></tr></table>` : ""}
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0;">Contact us on Discord if you have questions.</p>
    `),
  });
}

export async function sendCallScheduled(email: string, amount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Verification call scheduled",
    html: wrap(`
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 16px;">A verification call has been scheduled for your payout of <strong style="color: #000000 !important;">$${amount.toFixed(2)}</strong>.</p>
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0;">Please select a time that works for you by visiting your Payouts page.</p>
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
      <div style="text-align: center; padding: 8px 0 16px;">
        <span class="accent-blue" style="font-size: 13px; color: #2596be !important; letter-spacing: 2px; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">New Campaign Available</span>
      </div>
      <h1 style="color: #000000 !important; font-size: 24px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; margin: 0 0 16px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${escapeHtml(campaignName)}</h1>
      <p style="color: #4a5568 !important; font-size: 15px; margin: 0 0 24px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${escapeHtml(desc)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 28px; background-color: rgba(0, 0, 0, 0.04) !important; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 12px;">
        <tr>
          <td class="stats-cell" style="padding: 18px; text-align: center; border-right: 1px solid rgba(0, 0, 0, 0.08); background-color: rgba(0, 0, 0, 0.04) !important;">
            <p style="color: #6b7280 !important; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">CPM Rate</p>
            <p class="accent-blue" style="color: #2596be !important; font-size: 22px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${cpm ? "$" + cpm.toFixed(2) : "\u2014"}</p>
          </td>
          <td class="stats-cell" style="padding: 18px; text-align: center; background-color: rgba(0, 0, 0, 0.04) !important;">
            <p style="color: #6b7280 !important; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Budget</p>
            <p style="color: #10b981 !important; font-size: 22px; font-weight: 700; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${budget ? "$" + budget.toLocaleString() : "\u2014"}</p>
          </td>
        </tr>
      </table>
      <p style="color: #4a5568 !important; font-size: 14px; text-align: center; margin: 0 0 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Check out the details and join when you're ready.</p>
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
      <p style="font-size: 13px; color: #6b7280 !important; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 12px; text-align: center;">Payout Reminder</p>
      <p style="font-size: 16px; color: #4a5568 !important; margin: 0 0 16px; text-align: center;">You have <strong style="color: #2596be;">${escapeHtml(amount)}</strong> unpaid from <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong>.</p>
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0 0 28px; text-align: center;">Please request your payout so we can process it.</p>
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
      <p style="font-size: 16px; color: #000000 !important; margin: 0 0 12px;">Your clip was rejected</p>
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 20px;">Your clip for <strong style="color: #000000 !important;">${escapeHtml(campaignName)}</strong> was rejected.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(239, 68, 68, 0.08) !important; border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 12px; margin: 0 0 24px;">
        <tr><td style="padding: 16px 18px; background-color: rgba(239, 68, 68, 0.08) !important;">
          <p style="font-size: 18px; color: #b91c1c !important; font-weight: 600; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${timeStr} left to post today to keep your streak!</p>
        </td></tr>
      </table>
      <p style="font-size: 14px; color: #4a5568 !important; margin: 0 0 28px;">Submit a new clip now before the day ends.</p>
      ${emailButton("Submit a Clip", "https://clipershq.com/clips")}
    `),
  });
}

export async function sendConsecutiveRejectionWarning(email: string, rejectionCount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Multiple clips rejected — please review requirements",
    html: wrap(`
      <p style="font-size: 13px; color: #6b7280 !important; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 12px;">Quality Warning</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(239, 68, 68, 0.08) !important; border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 12px; margin: 0 0 20px;">
        <tr><td style="padding: 16px 18px; background-color: rgba(239, 68, 68, 0.08) !important;">
          <p style="font-size: 16px; color: #b91c1c !important; font-weight: 600; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${rejectionCount} clips in a row have been rejected.</p>
        </td></tr>
      </table>
      <p style="font-size: 14px; color: #4a5568 !important; margin: 0 0 12px;">Please review the campaign requirements carefully before submitting more clips. Low quality submissions may result in account restrictions.</p>
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0 0 28px;">Check the campaign page for detailed requirements and examples.</p>
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
      <p style="font-size: 13px; color: #6b7280 !important; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 12px;">New message in your support chat</p>
      <p style="font-size: 16px; color: #000000 !important; margin: 0 0 12px;">Hi ${safeRecipient},</p>
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 20px;"><strong style="color: #000000 !important;">${safeSender}</strong> replied to your conversation:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: rgba(0, 0, 0, 0.04) !important; border: 1px solid rgba(0, 0, 0, 0.08); border-left: 3px solid #2596be; border-radius: 0 12px 12px 0; margin: 0 0 28px;">
        <tr><td style="padding: 14px 18px; background-color: rgba(0, 0, 0, 0.04) !important;">
          <p style="margin: 0; color: #4a5568 !important; font-size: 14px; font-style: italic; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">&ldquo;${preview}${truncated}&rdquo;</p>
        </td></tr>
      </table>
      ${emailButton("Reply now", conversationUrl)}
      <p style="font-size: 12px; color: #6b7280 !important; margin: 28px 0 0; text-align: center;">If you didn&rsquo;t expect this email, you can safely ignore it.</p>
    `),
  });
}

export async function sendClientInviteEmail(email: string, link: string): Promise<boolean> {
  return sendEmailWithRetry({
    to: email,
    subject: "You're invited to view your campaign on Clippers HQ",
    html: wrap(`
      <p class="accent-blue" style="font-size: 13px; color: #2596be !important; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 12px;">You've been invited</p>
      <h1 style="color: #000000 !important; font-size: 24px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; margin: 0 0 16px;">View your campaign on Clippers HQ</h1>
      <p style="font-size: 15px; color: #4a5568 !important; margin: 0 0 16px;">You've been invited to view your campaign performance.</p>
      <p style="font-size: 14px; color: #6b7280 !important; margin: 0 0 28px;">Click the button below to access your dashboard. This link expires in 24 hours.</p>
      ${emailButton("Access Dashboard", link)}
      <p style="font-size: 12px; color: #6b7280 !important; margin: 28px 0 0; text-align: center;">If you didn't expect this email, you can safely ignore it.</p>
    `),
  });
}
