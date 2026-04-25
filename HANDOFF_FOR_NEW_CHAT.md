# CLIPPERS HQ — EXHAUSTIVE HANDOFF REPORT

> Generated for handoff to a new Claude chat session. Zero prior context assumed.
> Repo HEAD: `5dd9579` on `main`. Working tree clean. Date: 2026-04-24.

---

# SECTION 1 — PROJECT OVERVIEW

## 1.1 What is ClippersHQ?

**Clippers HQ** (domain: **clipershq.com**, ONE P in "clipers") is a SaaS platform that connects **content clippers** (short-form video editors/posters) with **brand campaigns**. Clippers take source footage (podcast, stream, IP) and post edited short-form clips on **TikTok, Instagram Reels, and YouTube Shorts**. They get paid on a **CPM basis** (dollars per 1,000 views) with automatic view tracking via **Apify**.

The platform handles the full loop: clipper onboarding (Discord OAuth or magic link), social-account verification, campaign discovery, clip submission, admin/owner review, view tracking every 1-8h, earnings calculation with streak/level/PWA bonuses, budget caps, fraud detection, payout requests, Discord integration, real-time community channels, and tickets.

Owner is **Danilo "Ankara"** (Belgrade, Serbia). Primary admin is **Dusan "Dacani98" / dusan_ristic_**. Secondary admin: **danilo3520**.

## 1.2 Business model

Revenue comes from:
1. **Agency fee** (legacy pricing model `AGENCY_FEE`): brand pays total budget, clippers paid out via CPM from that budget, the owner keeps the spread.
2. **CPM Split** (`CPM_SPLIT`): budget is split proportionally between clipper CPM and owner CPM. Every clip generates a `Clip.earnings` row for the clipper and an `AgencyEarning` row for the owner, both cumulating against the shared budget.
3. **Platform fee on clippers**: 9% standard, 4% for referred users. Applied at payout time (not deducted from `Clip.earnings`; used to compute `finalAmount`).
4. **Referral program**: referrer earns **5% of the referred clipper's lifetime totalEarnings**, computed on-the-fly (no separate table).

## 1.3 Roles (enum `UserRole`)

- **OWNER**: God mode. Sees all campaigns, all earnings (clipper + agency), can force recalc, can run reset tool, can override referrals, can create PAST campaigns, can void PAID payouts.
- **ADMIN**: Scoped to campaigns they're assigned to via `CampaignAdmin`. Cannot see agency earnings or ownerCpm.
- **CLIPPER**: Default role. Sees own clips/earnings/campaigns/payouts. Restricted from `/api/admin/*`.
- **CLIENT**: Brand-facing read-only. Authenticates via magic-link email only. Sees only campaigns they're linked to via `CampaignClient`.

## 1.4 Domain

**clipershq.com** — ONE P. Legacy mistake: `clippershq.vercel.app` still referenced in old .env.local (user fixed). Never write "clippershq" anywhere user-facing.

## 1.5 Deployment

- **Railway** hosts two services:
  - Web service (Next.js)
  - Tracking-cron service (runs `npm run cron:tracking` = `tsx scripts/run-tracking-cron.ts`)
- Auto-deploys on push to `main`. Deploy takes ~2-3 minutes.
- DB: **Supabase Postgres** (external).
- DNS: **Namecheap**. WWW redirect configured via Advanced DNS URL Redirect Record (permanent 301 to apex).

## 1.6 Production status

- **LIVE**. First real campaign running.
- Campaign name: **"somesome"** — $900 budget, $360 spent (40%), clipperCpm $2, ownerCpm $1.
- 14 clips / 6 active clippers / 5 approved / 8 pending / 487K+ views.
- One clip at 436K+ views still going viral.
- Max clipper cap per clip $200, max owner cap $100.

---

# SECTION 2 — COMPLETE TECH STACK

All versions from `package.json`:

## 2.1 Runtime/Framework
- **Next.js 16.2.1** (App Router) — NOTE: CLAUDE.md says "14" but package.json is actually 16.2.1.
- **React 19.2.4**, **React DOM 19.2.4**
- **TypeScript ^5**
- **Bun 1.3.13** available locally but `scripts/build` uses `prisma generate && next build` (Node based). `engines.node >=20`.

## 2.2 Database
- **Postgres** via Supabase (connection string in `DATABASE_URL`).
- **Prisma 7.5.0** — uses `@prisma/adapter-pg` (pg.Pool) and `@prisma/client`. `prisma generate` only — never `prisma migrate` per CLAUDE.md. Schema changes go via raw SQL run in Supabase SQL Editor.
- Generated client: `src/generated/prisma/` (non-standard location; see `prisma/schema.prisma` `output`).

## 2.3 Auth
- **NextAuth v5 beta.30** (`next-auth ^5.0.0-beta.30`), `@auth/prisma-adapter ^2.11.1`.
- Providers: **Discord OAuth** (primary), **Google OAuth** (conditional on `GOOGLE_CLIENT_ID`), **magic link** (CLIENT role only — separate custom endpoints at `/api/auth/request-magic-link` + `/api/auth/verify-magic-link`).
- `trustHost: true` so Railway proxy is honored.
- Session strategy: database (via `auth_sessions` model in Prisma).

## 2.4 External services
- **Resend** — transactional email (`EMAIL_API_KEY`, `EMAIL_FROM`). 10s `AbortController` timeout in `src/lib/email.ts`.
- **Apify** — social media scraping (TikTok, Instagram Reels, YouTube Shorts). Actors: `clockworks/tiktok-scraper`, `apify/instagram-reel-scraper`, `apify~instagram-profile-scraper`. Token: `APIFY_API_KEY` (also `APIFY_TOKEN` fallback).
- **Ably** — realtime pub/sub for SSE-equivalent (`publishToUser`, `publishToUsers`). `ABLY_API_KEY`.
- **Discord bot** — DMs clippers on campaign alert broadcast. `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_ALERT_ROLE_ID`.
- **YouTube Data API** — profile info for YT clippers. `YOUTUBE_API_KEY`.
- **Browserless** — screenshot-based account verification fallback. `BROWSERLESS_API_KEY`/`BROWSERLESS_URL`.
- **Anthropic API** — `/api/chat` (in-app AI chatbot for clippers). `ANTHROPIC_API_KEY`.
- **Supabase Storage** — image uploads for campaign cards/banners/community avatars. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Jitsi** — voice calls (via `@jitsi/react-sdk ^1.4.4`). No external key.

## 2.5 Frontend libraries
- **Tailwind CSS v4** + `@tailwindcss/postcss`
- **lucide-react ^0.577.0** (ONLY icon library — no emoji in UI)
- **recharts ^3.8.1** — charts on /earnings
- **sonner ^2.0.7** — toasts
- **react-easy-crop ^5.5.7** — image cropping for campaign image uploads
- **next-themes ^0.4.6** (dark-only, no light theme support)
- No Framer Motion / no shadcn components (custom-built UI primitives in `src/components/ui/`).

## 2.6 Other
- **exceljs ^4.4.0** — CSV/XLSX export on `/api/admin/export`
- **sharp ^0.34.5** — image processing server-side
- **@supabase/supabase-js ^2.101.1**
- **@prisma/pg-worker ^6.9.0** (worker edition)
- **dotenv ^17.3.1**, **tsx ^4.21.0**

---

# SECTION 3 — COMPLETE FILE STRUCTURE

## 3.1 Directory tree (3 levels deep)

```
src/
├── actions/                          # Server actions (few — mostly API routes used)
├── app/
│   ├── (app)/                        # Authenticated pages, wrapped by app-layout.tsx
│   │   ├── accounts/                 # Social account connect/verify
│   │   ├── admin/                    # OWNER/ADMIN-only pages (23 subpages)
│   │   ├── campaigns/                # Campaign discovery + detail
│   │   ├── client/                   # CLIENT role pages (read-only dashboard)
│   │   ├── clips/                    # Clip submit + management
│   │   ├── community/                # Discord-style channels + tickets
│   │   ├── dashboard/                # Clipper home
│   │   ├── earnings/                 # Deep-dive charts + campaign breakdown
│   │   ├── favorites/                # (unused for now)
│   │   ├── help/                     # 12 collapsible FAQ sections
│   │   ├── payouts/                  # Request + history
│   │   ├── progress/                 # Streak/level gamification
│   │   └── referrals/                # Referral stats + share link
│   ├── api/                          # All API routes (102 route.ts files)
│   ├── auth/verify/                  # Magic-link landing
│   ├── brands/                       # Public marketing for brands
│   ├── client/login/                 # Magic-link request form
│   ├── dev-login/                    # Dev-only login bypass
│   ├── login/                        # OAuth entry
│   ├── globals.css, layout.tsx, page.tsx, robots.ts, sitemap.ts
├── components/
│   ├── chat/                         # AI chat widget + support chat
│   ├── community/                    # ChannelChat, ServerStrip, MessageInput, VoiceRoom, etc.
│   ├── earnings/                     # Chart components
│   ├── layout/                       # app-layout, navbar, sidebar
│   ├── ui/                           # Button, Card, Badge, Modal, Input, Skeleton, etc.
│   ├── dev-auth-provider.tsx, providers.tsx, pwa-install-popup.tsx,
│   ├── theme-provider.tsx, tracking-modal.tsx
├── generated/prisma/                 # Prisma generated client (committed)
├── hooks/                            # useAblyChannel, useDebounce, etc.
├── lib/                              # 36 library files (business logic)
└── types/                            # TypeScript shared types
```

## 3.2 Major directories

- **`src/app/(app)/`** — Authenticated area. Layout wraps all with `app-layout.tsx` (sidebar + navbar).
- **`src/app/api/`** — All API routes, 102 endpoints organized by domain. Always use `NextResponse.json`, `export const dynamic = "force-dynamic"`, `export const maxDuration = 15 or 30`.
- **`src/components/ui/`** — Low-level UI primitives. Cards use `bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl`. Buttons have `active:scale-[0.97]`, ripple, `hapticLight()`.
- **`src/lib/`** — Business logic. Key files listed in Section 5.
- **`prisma/schema.prisma`** — Single source of truth for DB schema.

## 3.3 Admin/OWNER-only pages (`src/app/(app)/admin/`)

| Page | Purpose |
|---|---|
| `/admin` | Admin home (dashboard for OWNER/ADMIN) |
| `/admin/accounts` | Clipper social-account review queue |
| `/admin/agency-earnings` | OWNER-only: per-clip agency earnings ledger |
| `/admin/analytics` | Platform-wide metrics |
| `/admin/archive` | Archived campaigns |
| `/admin/calls` | Scheduled payout-verification calls |
| `/admin/campaigns` | Campaign CRUD + status flips |
| `/admin/clients` | CLIENT user management, invite magic links |
| `/admin/clips` | All-clips review queue (with copyable clip IDs, recently added) |
| `/admin/command-center` | Platform health panel |
| `/admin/flags` | FLAGGED clips / fraud queue |
| `/admin/force-recalc` | **OWNER-only** 3-panel recalc tool (single clip / campaign / ALL) |
| `/admin/knowledge` | AI chatbot knowledge base CRUD |
| `/admin/past-campaigns` | **NEW** OWNER-only PAST campaign display-only CRUD |
| `/admin/payouts` | Payout review queue |
| `/admin/referral-override` | **NEW** OWNER-only retroactive referral setter |
| `/admin/referrals` | Referral analytics |
| `/admin/reset-data` | **OWNER-only** pre-launch soft-delete reset (dangerous) |
| `/admin/settings` | Gamification config, platform settings |
| `/admin/submit-clip` | Admin-side clip submit (on behalf of clipper) |
| `/admin/team` | Team/member management |
| `/admin/users` | User list + role management |

## 3.4 Clipper-facing pages (`src/app/(app)/`)

| Page | Purpose |
|---|---|
| `/dashboard` | Quick-glance home: earnings, level, streak, clips today. NO charts, NO clip lists. |
| `/campaigns` | Campaign discovery grid + horizontal PAST campaigns strip |
| `/campaigns/[id]` | Campaign detail, join, clip submit |
| `/clips` | All clips, statuses, submit form |
| `/earnings` | Deep dive — charts, per-campaign breakdown, timeframe filtering |
| `/payouts` | Available balance, request form, payout history. NO earnings breakdown. |
| `/progress` | Gamification — streak grid, levels, bonuses, leaderboard |
| `/accounts` | Social media account connect/verify |
| `/referrals` | Referral code, stats, share link |
| `/community` | Discord-style channels + tickets across all joined campaigns |
| `/community/[campaignId]` | Specific campaign community view |
| `/help` | 12 collapsible sections, simple language, scannable |
| `/favorites` | Currently unused |

## 3.5 Client-facing pages
- `/client` — read-only campaign performance view
- `/client/campaigns` — list of campaigns the client is linked to

---

# SECTION 4 — DATABASE SCHEMA

Full `prisma/schema.prisma` is dumped in Section 19.1 (below). Summary of models:

## 4.1 Auth
- **Account** (`auth_accounts`) — NextAuth OAuth accounts
- **Session** (`auth_sessions`) — NextAuth sessions
- **VerificationToken** — NextAuth email verification
- **MagicLinkToken** — CLIENT-only magic-link auth (custom, separate from NextAuth)

## 4.2 User + permissions
- **User** — central model. Key non-obvious fields:
  - `referralCode` — unique, auto-generated on first access (8 chars)
  - `referredById` — self-relation for 5% referral earnings
  - `referrerOverriddenBy` / `referrerOverriddenAt` — **NEW** markers for manual OWNER overrides via `/admin/referral-override`
  - `manualBonusOverride` — OWNER can force a specific bonus % (capped at MANUAL_OVERRIDE_CEILING=30)
  - `isPWAUser` / `lastPWAOpenAt` — +2% bonus requires `lastPWAOpenAt` within 2 days
  - `streakRestoredAt` — 36h grace window after manual streak restoration
  - `isDeleted` / `deletedAt` — **NEW** soft-delete flag used by `/admin/reset-data`
  - `aiMessageCount` / `aiQuotaResetAt` — persisted AI chat quota (previously in-memory, reset on deploy — fixed)
- **UserRole** enum: `CLIPPER | ADMIN | OWNER | CLIENT`
- **UserStatus** enum: `ACTIVE | BANNED | SUSPENDED`

## 4.3 Teams
- **Team**, **TeamMember** (role: LEAD/MEMBER/VIEWER), **TeamCampaign**

## 4.4 Campaigns
- **Campaign** — the monetization object.
- **CampaignStatus** enum: `ACTIVE | PAUSED | COMPLETED | DRAFT | PAST` — **PAST newly added**.
- Notable fields:
  - `pricingModel` — "AGENCY_FEE" or "CPM_SPLIT"
  - `clipperCpm` / `ownerCpm` / `agencyFee`
  - `budget` / `lastBudgetPauseAt` (set on auto-pause; cleared on manual pause or resume)
  - `manualSpent` — **NEW** OWNER-supplied spent value for PAST display-only campaigns
  - `announceOnDiscord` — if true, broadcasts Discord DM + email on create
  - Three image slots: `cardImageUrl` (800x800), `bannerImageUrl` (1920x600), `communityAvatarUrl` (256x256 circle). Legacy `imageUrl` kept as fallback.
  - `isArchived` / `archivedAt` / `archivedById` — soft-delete separate from status

## 4.5 Clips + tracking
- **Clip** — central revenue-bearing object.
- **ClipStatus** enum: `PENDING | APPROVED | REJECTED | ARCHIVED | FLAGGED`
- Key fields:
  - `earnings` (clipper gross, bonus-inclusive, pre-fee) / `baseEarnings` (pre-bonus) / `bonusPercent` / `bonusAmount`
  - `fraudScore` (0-100) / `fraudReasons` (JSON array) / `fraudCheckedAt`
  - `feePercentAtApproval` (4 or 9, frozen at approval)
  - `streakBonusPercentAtApproval` — **locked snapshot** so future streak changes don't retro-adjust
  - `streakDayLocked` + `streakDayLockedAt` — day locked when first clip approved that day
  - `videoUnavailable` + `videoUnavailableSince` + `savedEarnings` — Apify "not found" flow
  - `isOwnerOverride` — manual owner submission, excluded from user-level leaderboards and trust/level calculations
- **ClipStat** — snapshot of views/likes/comments/shares from Apify. Every tracking run creates a row.
- **TrackingJob** — cron schedule per clip. `nextCheckAt`, `checkIntervalMin` (5-720 min). Paused via `isActive`.
- **AgencyEarning** — OWNER's per-clip earnings for CPM_SPLIT campaigns. Unique on `clipId`. Has its own `views` snapshot (but admin/agency-earnings now reads live ClipStat per commit cb8758d).
- **CampaignAccount** — join table: which clip accounts are joined to which campaigns.
- **ClipAccount** — a user's verified TikTok/IG/YT account. Enum `ClipAccountStatus`: `PENDING | VERIFIED | APPROVED | REJECTED`.

## 4.6 Payouts
- **PayoutRequest** — with `status` enum `REQUESTED | UNDER_REVIEW | APPROVED | PAID | REJECTED | VOIDED` (`VOIDED` added commit 5e34cf0 — owner can force-void PAID payouts).
- `feePercent` / `bonusPercent` / `feeAmount` / `bonusAmount` / `finalAmount` — all computed and frozen at payout creation.
- **ScheduledCall** — optional payout verification call (Jitsi).

## 4.7 Community
- **Channel** — per-campaign channel. Types: `general | announcement | leaderboard`.
- **ChannelMessage** — soft-delete via `isDeleted`, supports `replyToId` threading, `reactions` relation.
- **MessageReaction** — one row per (message, user, emoji). Unique `@@unique([messageId, userId, emoji])`.
- **CampaignTicket** — 1-on-1 DM between clipper and admins, unique per (campaignId, userId). Status: `open | waiting | resolved | pending`.
- **TicketMessage** — messages within tickets.
- **ChannelReadStatus** — tracks unread counts per (channel, user). Upserted on GET messages.
- **CommunityMute** — user opt-out of channel emails.
- **CommunityModerationMute** — staff-issued timed mute (blocks channel posting, not tickets).
- **CommunityActivity** — audit log of joins/leaves.
- **ScheduledVoiceCall** — Jitsi-based voice calls, per-campaign or global.

## 4.8 Misc
- **AuditLog** — every admin action. Indexed by `userId`, `(targetType, targetId)`, `createdAt`.
- **Notification** — in-app notifications. `type` = `CLIP_SUBMITTED | CLIP_APPROVED | CLIP_REJECTED | CLIP_FLAGGED | STREAK_WARNING | LEVEL_UP | REFERRAL_SIGNUP | ...`.
- **CampaignEvent** — budget history, status changes.
- **Note** — internal CRM notes about users/campaigns/clips.
- **Conversation** / **ConversationParticipant** / **Message** — support chat (separate from community channels).
- **ChatKnowledge** — AI chatbot KB.
- **GamificationConfig** — key/value JSON overrides for level thresholds, streak tiers, fees.
- **CronLock** — row-based mutex for tracking cron. Staleness window 10min.
- **PendingCampaignEdit** — admin edit request queue.
- **CampaignClient** — join: CLIENT users ↔ campaigns they can view.

---

# SECTION 5 — CORE BUSINESS LOGIC (file-by-file)

## 5.1 `src/lib/tracking.ts` (989 lines — dumped in full below in 19.3)

The heart of the platform. Runs from Railway's native cron service (no HTTP timeout).

**Key functions:**
- `runDueTrackingJobs(options)` — entry point. Acquires row-lock via `cron_locks` table, finds jobs where `nextCheckAt <= now`, groups by campaign (parallel across campaigns, sequential within same campaign to prevent budget race conditions).
- `processTrackingJob(job, source, details, prefetchedStats)` — per-clip work. Fetches stats (Apify), saves ClipStat, runs fraud detection, recalculates earnings inside Serializable transaction with **3-attempt P2034 retry** (commit 793b26d), handles budget cap ratio-split, auto-pauses campaign at budget.
- `getNextInterval(...)` — tiered schedule: Phase 1 (0-48h) = 60min, Phase 2 = view bracket + growth/hr (premium/high/medium/low/dead), max 8h, "actually-dead" override = 12h.
- `acquireTrackingLock()` / `releaseTrackingLock()` — row-based lock on `cron_locks` table. Postgres advisory locks don't work due to @prisma/adapter-pg using pg.Pool.

**Skip conditions:**
- Campaign status `PAUSED`, `ARCHIVED`, or `PAST` → skip earnings recalc (stats still saved for historical).
- User `BANNED` → stats saved but earnings frozen.
- Clip `videoUnavailable` → detection checks if views came back, restores earnings from `savedEarnings`.

**Apify cap:** `MAX_APIFY_CALLS_PER_RUN = 200` ceiling ≈ 57,600 calls/day worst case.
**Deadline:** 480 seconds wall clock per run; deferred jobs roll to next tick.

## 5.2 `src/lib/earnings-calc.ts` (370 lines — dumped in 19.4)

Single monetization model: fixed clipper budget with optional owner CPM (CPM_SPLIT).

**Constants:**
- `DEFAULT_LEVEL_THRESHOLDS` — [0, 300, 1000, 2500, 8000, 20000] at levels 0-5
- `DEFAULT_LEVEL_BONUSES` — {0:0, 1:3, 2:6, 3:10, 4:15, 5:20} (%)
- `DEFAULT_STREAK_BONUSES` — [3d:1%, 7d:2%, 14d:3%, 30d:5%, 60d:7%, 90d:10%]
- `DEFAULT_PLATFORM_FEE = 9`, `DEFAULT_REFERRED_FEE = 4`
- `MAX_BONUS_CAP = 25`, `MANUAL_OVERRIDE_CEILING = 30`
- `DEFAULT_REFERRAL_PERCENT = 5`, `PWA_BONUS_PERCENT = 2`

**Key functions:**
- `calculateClipperEarnings(input)` — main entrypoint. Returns `EarningsBreakdown { clipperEarnings, platformFee, bonusPercent, bonusAmount, baseEarnings, effectiveFeePercent, grossClipperEarnings }`.
- `calculateOwnerEarnings(views, ownerCpm, clipperGrossEarnings?, clipperCpm?)` — proportional when cap applies.
- `recalculateClipEarningsBreakdown({ stats, campaign, user, streakBonusPercentAtApproval })` — snapshot-aware.
- `getStreakBonusPercent(streakDays, tiers)` — exported so approval can freeze the value.
- `computeLevel(totalEarnings, thresholds)` — simple lookup.

**Critical rule:** `maxPayoutPerClip` caps **base earnings BEFORE bonus**. A clipper with +10% bonus on a $5-capped clip earns **$5.50**, not $5.00. Bonus comes from campaign budget as incentive, free to exceed per-clip cap.

## 5.3 `src/lib/gamification.ts` (847 lines)

**Key functions:**
- `loadConfig()` — loads GamificationConfig rows, falls back to DEFAULTS.
- `updateStreak(userId)` — **idempotent**. Walks YYYY-MM-DD strings backwards from yesterday in user's timezone. Handles "passed/failed/pending" days, 36h restoredAt grace, "today counts if APPROVED/PENDING/locked clip exists today" rule, freeze if no actively-posting campaigns.
- `dayBoundsFromStr(dateStr, tz)` — DST-safe: `end` is next-day-midnight minus 1ms, not start+24h. Critical for fractional-offset tzs (India +5:30, Nepal +5:45, Chatham +12:45).
- `evaluateDayByBounds(userId, start, end)` — returns "passed" (approved or `streakDayLocked`), "failed" (all rejected or no clips), "pending" (unreviewed clips).
- `updateUserLevel(userId)` — recomputes level from `totalEarnings`, writes user, triggers `recalculateUnpaidEarnings` if changed.
- `getGamificationState(userId)` — 30s in-memory cached. Runs streak update, validates totalEarnings against live aggregate, recomputes level.
- `recalculateUnpaidEarnings(userId)` — recomputes every APPROVED clip not in a PAID payout. Groups by campaign, tracks running totals, enforces budget cap with ratio-based split, respects `lastBudgetPauseAt` budget-lock (old clips keep earnings if approved before pause).
- `getStreakDayStatuses(userId, days=60)` — returns array "confirmed"/"pending"/"empty" for UI grid.
- `dayBoundsForTz(d, timezone)` — public helper for review endpoint.

**PWA bonus rule:** `isPWAUser=true` AND `lastPWAOpenAt` within last 2 days. Self-heals by setting `isPWAUser=false` when stale.

## 5.4 `src/lib/balance.ts` (141 lines — dumped in 19.5)

Centralized balance math. Pure functions over `{ clips, payouts }`.

- `computeBalance(input)` — returns `{ totalEarned, approvedEarnings, pendingEarnings, paidOut, lockedInPayouts, available }`.
- `computeCampaignBalances(input)` — per-campaign breakdown.
- `getCampaignBudgetStatus(campaignId)` — **async**, reads DB. Returns `{ budget, spent, remaining, isOverBudget }`. Sums `Clip.earnings` where `status=APPROVED && !videoUnavailable && !isDeleted`, adds `AgencyEarning.amount` sum for CPM_SPLIT.
- `LOCKED_PAYOUT_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED"]`.
- **LEAK 2 (see §8.15):** `computeBalance` filters by `status === "APPROVED"` — FLAGGED clips drop to $0 in balance which is confusing when the clip UI now shows them as PENDING.

## 5.5 `src/lib/fraud.ts` (149 lines)

Stats-only fraud detection (no trustScore). Signals:
1. View spike extreme >100x (+40), moderate >15x (+20)
2. Views/likes ratio >500 (+30), >200 (+15)
3. Comments-to-views: <2 comments at 2000+ views (+10)
4. 2000+ views, 0 comments, <10 likes (+20)
5. Likes grew 5x while views grew <2x (+25)
6. Likes > views (+35)
7. Views decreased (+30)
8. Stale-then-spike: 3+ flat checks then >10x jump (+25)

**Thresholds:** `AUTO_FLAG_THRESHOLD = 30`, `HIGH_RISK_THRESHOLD = 50`. Returns level `CLEAN | SUSPECT | FLAGGED | HIGH_RISK`.

## 5.6 `src/lib/email.ts` (378 lines)

All transactional email goes through Resend. Key points:
- **10s AbortController timeout** on the Resend fetch (commit 2996e8d) — previously routes could hang indefinitely.
- `sendEmailWithRetry` — one retry after 2s for critical emails.
- Dark-only email template (`wrap(content)`) with explicit `background-color !important` to defeat Gmail's light-mode auto-recoloring.
- `escapeHtml(str)` — prevents stored XSS via usernames, campaign names, rejection reasons.
- `safeSubject(str)` — strips CR/LF to block header injection.
- Export names: `sendWelcomeEmail`, `sendClipApproved`, `sendClipRejected`, `sendPayoutApproved`, `sendPayoutRejected`, `sendCallScheduled`, `sendClipSubmitted`, `sendStreakWarning`, `sendCampaignApproved`, `sendCampaignRejected`, `sendCampaignAlertEmail`, `sendReferralSignup`, `sendPayoutReminder`, `sendStreakRejectionWarning`, `sendConsecutiveRejectionWarning`, `sendChatReplyEmail`, `sendClientInviteEmail`.

## 5.7 `src/lib/auth.ts` + `src/lib/get-session.ts`

NextAuth v5 setup. Discord is the primary provider; Google is conditional on `GOOGLE_CLIENT_ID`.
- `AUTH_OWNER_EMAIL` env var — if user signs up with this email, they get OWNER role.
- Session callback force-logs out users where `isDeleted === true` (reset-tool soft-delete enforcement).
- Magic-link auth for CLIENT is separate — doesn't go through NextAuth, uses custom `/api/auth/request-magic-link` + `/api/auth/verify-magic-link` which writes directly to the Session table and sets the `authjs.session-token` cookie.
- `getSession()` reads the active NextAuth session.
- **Pattern:** on OWNER-only endpoints, re-check role against fresh DB read rather than trusting `session.user.role` (session role can go stale).

## 5.8 `src/lib/referrals.ts` (70 lines)

- `generateCode()` — 8-char random from alphanumeric (excl confusing chars).
- `ensureReferralCode(userId)` — idempotent creation with collision retry.
- `attachReferral(newUserId, referralCode)` — only on first attach (never overwrites existing `referredById`). Rejects self-ref, rejects banned referrer.
- `getReferralStats(userId)` — **computes on-the-fly**: `totalEarnings × 5%` per referral. **No ReferralEarning table.** This means overrides automatically pick up lifetime earnings.

## 5.9 `src/lib/audit.ts`

- `logAudit({ userId, action, targetType, targetId, details })` — writes AuditLog row with JSON-stringified details. Actions include: `APPROVE_CLIP`, `REJECT_CLIP`, `REFERRAL_OVERRIDE`, `REFERRAL_OVERRIDE_REMOVED`, `REJECT_PAYOUT`, `PAY_PAYOUT`, `VOID_PAYOUT`, etc.

## 5.10 `src/lib/discord-bot.ts`

- Direct-messages clippers via Discord bot token.
- `broadcastCampaignAlert` — DMs every active clipper when `announceOnDiscord=true` on campaign create.
- Uses `DISCORD_ALERT_ROLE_ID` to filter recipients.

## 5.11 `src/lib/haptics.ts`

- `hapticLight()` / `hapticMedium()` / `hapticHeavy()` — wraps `navigator.vibrate` conditionally. Used on every button press.

## 5.12 `src/lib/check-ban.ts`

- `checkBanStatus(session)` — returns NextResponse(403) if user is banned/suspended. Called at top of every API route before logic.

## 5.13 Other notable `src/lib/` files

- `ably.ts` — `publishToUser(userId, event, data)`, `publishToUsers(userIds, event, data)`.
- `apify.ts` — `fetchClipStats(url)`, `fetchClipStatsBatch(inputs)`, `detectPlatform(url)`.
- `campaign-access.ts` — `getUserCampaignIds(userId, role)` for ADMIN scoping.
- `campaign-events.ts` — `logCampaignEvent(campaignId, type, description, metadata)`.
- `chat-access.ts` — conversation/participant lookups.
- `chatbot.ts` — AI chatbot Claude-API integration. Quota now persisted in DB (was in-memory).
- `community.ts` — channel/ticket helpers.
- `community-email.ts` — announcement emails.
- `db.ts` — Prisma client singleton with @prisma/adapter-pg.
- `dev-auth.ts` — dev-only bypass (requires both `DEV_AUTH_BYPASS=true` and `NODE_ENV !== production`).
- `earnings.ts` — thin wrappers / legacy helpers.
- `notifications.ts` — `createNotification(userId, type, title, body, metadata)`.
- `payout-calc.ts` — pure-function payout amount/fee/bonus math.
- `rate-limit.ts` — in-memory per-instance rate limiter with `checkRateLimit(key, max, windowMs)`.
- `sse-broadcast.ts` — legacy SSE; mostly replaced by Ably.
- `toast.ts`, `sounds.ts`, `utils.ts` — UI helpers.
- `youtube.ts` — YouTube Data API integration.

---

# SECTION 6 — ALL API ROUTES

102 `route.ts` files. Full list in Section 3.1 (above). Key routes:

| Route | Methods | Role | Purpose |
|---|---|---|---|
| `/api/campaigns` | GET, POST | Varies | List (CLIPPER sees active/paused only, OWNER sees all), create (OWNER/ADMIN) |
| `/api/campaigns/[id]` | GET, PATCH, DELETE | Scoped | Detail, edit, delete (soft via isArchived) |
| `/api/campaigns/past` | GET | Non-CLIENT | 20 most recently-updated PAST campaigns, trimmed shape (no ownerCpm) |
| `/api/campaigns/past-create` | GET, POST, PATCH, DELETE | OWNER | CRUD for PAST display-only campaigns with `manualSpent` |
| `/api/campaigns/spend` | GET | Scoped | Budget status; CLIPPERs see limited version |
| `/api/campaigns/[id]/destroy` | POST | OWNER | Hard-destroy (rarely used) |
| `/api/campaigns/[id]/events` | GET | OWNER/ADMIN | Campaign event timeline |
| `/api/campaigns/[id]/notify` | POST | OWNER/ADMIN | Manual re-broadcast |
| `/api/campaigns/[id]/restore` | POST | OWNER | Un-archive |
| `/api/campaigns/members` | GET | Scoped | Clippers joined to campaign |
| `/api/clips` | GET, POST | Mixed | GET=admin list; POST=CLIPPER clip-submit |
| `/api/clips/mine` | GET | CLIPPER | Own clips — **NEW sanitization** maps FLAGGED→PENDING, strips fraud fields |
| `/api/clips/[id]` | GET, DELETE | Owner or admin | Detail / soft-delete |
| `/api/clips/[id]/review` | POST | OWNER/ADMIN | Approve/reject/flag/unflag. Serializable tx with budget cap. |
| `/api/clips/[id]/override` | POST | OWNER | Manual `earnings` override |
| `/api/clips/[id]/tracking` | POST | OWNER/ADMIN | Manual trigger one clip's tracking |
| `/api/clips/owner-submit` | POST | OWNER | Submit on behalf of clipper |
| `/api/clips/fetch-stats` | POST | OWNER/ADMIN | One-off Apify fetch |
| `/api/earnings` | GET | CLIPPER | Earnings data — **LEAK 1 (§8.15):** doesn't sanitize FLAGGED→PENDING |
| `/api/payouts` | GET, POST | CLIPPER | Own payouts + request |
| `/api/payouts/mine` | GET | CLIPPER | Own payouts list |
| `/api/payouts/[id]/review` | POST | OWNER/ADMIN | Approve/reject/pay/void |
| `/api/admin/force-recalc-earnings` | POST | OWNER | 3 modes: clip/campaign/all |
| `/api/admin/referral-override` | GET, POST, DELETE | OWNER | Retroactive referral setter with cycle detection |
| `/api/admin/agency-earnings` | GET | OWNER | Per-clip agency ledger, reads live ClipStat views (commit cb8758d) |
| `/api/admin/team` + `/api/admin/teams/[id]` | Various | OWNER | Team management |
| `/api/admin/reset-data` | POST | OWNER | Pre-launch soft-delete, reversible via `scripts/restore-deleted.ts` |
| `/api/admin/users` + `/[id]` | Various | OWNER | User CRUD, role change |
| `/api/admin/users/[id]/restore-streak` | POST | OWNER | Manual streak restore with 36h grace |
| `/api/admin/campaign-admins` | Various | OWNER | Assign admins to campaigns |
| `/api/admin/export` | GET | OWNER | XLSX export |
| `/api/admin/knowledge` + `/seed` | Various | OWNER | AI chatbot KB |
| `/api/admin/command-center` | GET | OWNER | Health panel data |
| `/api/admin/archive/[campaignId]` | POST | OWNER | Archive campaign |
| `/api/admin/fix-*` (backfill/budget/earnings/tracking/usernames) | POST | OWNER | One-off migration/fix scripts |
| `/api/admin/track-all` | POST | OWNER | Force trigger full tracking run |
| `/api/admin/pending-edits` + `/[id]` | Various | OWNER/ADMIN | Campaign edit approval queue |
| `/api/admin/clients` | Various | OWNER | CLIENT user management + invite |
| `/api/admin/payouts/unpaid` + `/notify` | Various | OWNER | Unpaid reminders |
| `/api/admin/accounts/[id]` | Various | OWNER | Account review |
| `/api/auth/request-magic-link` | POST | Anonymous | Rate-limited (3/hr per email + 3/hr DB-level), fire-and-forget email |
| `/api/auth/verify-magic-link` | GET | Anonymous | Consumes token atomically, creates session cookie. **publicBaseUrl helper** to prevent localhost redirects on Railway |
| `/api/auth/magic-link` | POST | Anonymous | Legacy magic-link (`maxDuration = 15`) |
| `/api/auth/[...nextauth]` | Various | N/A | NextAuth handler |
| `/api/community/campaigns` | GET | Auth | Sidebar list — **hides PAST for non-OWNER** |
| `/api/community/channels` + `/create` + `/[id]` | Various | Scoped | Channel CRUD |
| `/api/community/channels/[id]/messages` | GET, POST | Scoped | Messages + **server-side mark-read on GET** |
| `/api/community/channels/[id]/leaderboard` | GET | Scoped | Per-channel leaderboard |
| `/api/community/tickets` + `/[id]` + `/messages` | Various | Scoped | Ticket system |
| `/api/community/reactions` | POST, DELETE | Auth | Emoji reactions |
| `/api/community/mute` + `/mutes` + `/mutes/me` | Various | Scoped | Moderation mutes + user opt-out |
| `/api/community/typing` | POST | Auth | Typing indicator via Ably |
| `/api/community/calls` + `/[id]` | Various | Scoped | Scheduled voice calls |
| `/api/community/activity` | GET | OWNER/ADMIN | Joins/leaves audit |
| `/api/chat/conversations` + `/[id]/messages` + `/[id]/read` | Various | Scoped | Support chat |
| `/api/chat/sse` | GET | Auth | Chat SSE stream |
| `/api/chat/unread` | GET | Auth | Unread count |
| `/api/chat/messageable-users` + `/campaign-chats` | GET | Scoped | Who can DM whom |
| `/api/accounts` + `/mine` + `/[id]` + `/review` + `/verify` | Various | Scoped | Social account CRUD + verification |
| `/api/campaign-accounts` | POST | CLIPPER | Join campaign |
| `/api/notifications` + `/count` + `/sse` | Various | Auth | In-app notifications |
| `/api/gamification` | GET | CLIPPER | getGamificationState response |
| `/api/referrals` | GET | CLIPPER | Own stats |
| `/api/user/pwa-status` | POST | Auth | Updates `isPWAUser` + `lastPWAOpenAt` |
| `/api/user/timezone` | POST | Auth | Updates timezone |
| `/api/calls` + `/book` + `/[id]` | Various | Scoped | Payout verification calls |
| `/api/client/campaigns` + `/[id]` + `/export` | GET | CLIENT | Read-only client views |
| `/api/ably-token` | POST | Auth | Ably capability token |
| `/api/upload` | POST | Auth | Supabase Storage upload for images |
| `/api/cron/tracking` | POST | CRON_SECRET | Cron entry (always requires `Authorization: Bearer $CRON_SECRET`) |
| `/api/health` | GET | Public | Health check |
| `/api/test-email` | POST | OWNER | Test Resend config |
| `/api/dev-auth` + `/api/dev/run-tracking` + `/api/dev/reset-campaigns` | POST | Dev only | 403 in production |

---

# SECTION 7 — COMMUNITY SYSTEM

## 7.1 Architecture

```
Campaign ──(1:n)── Channel ──(1:n)── ChannelMessage
              │
              └──(1:n)── CampaignTicket (unique per userId) ──(1:n)── TicketMessage
              │
              └──(1:n)── ScheduledVoiceCall (Jitsi rooms)
              │
              └──(1:n)── CommunityModerationMute / CommunityActivity
```

## 7.2 Channel types
- `general` — normal chat
- `announcement` — admin-only posting, users can read
- `leaderboard` — admin channel rendering the per-campaign leaderboard

## 7.3 Real-time
- **Ably** pub/sub (not native SSE despite CLAUDE.md mentioning SSE). `useAblyChannel` hook subscribes the client.
- Events: `channel_message`, `channel_typing`, `message_updated`, `message_deleted`, `reaction_added`, `reaction_removed`, `ticket_message`, `call_updated`.

## 7.4 Unread counts
- `ChannelReadStatus.lastReadAt` per (channelId, userId).
- Count = messages in channel with `createdAt > lastReadAt`.
- **Mark-read** is piggy-backed on `GET /api/community/channels/[id]/messages` — every time the client loads messages, the server upserts the user's `lastReadAt = NOW()`.
- No separate `/mark-read` endpoint; reduces round-trips and race conditions.

## 7.5 Sidebar cache TTL
- Was **30 seconds**, dropped to **3 seconds** in commit `0e5af44` to fix the "unread badge doesn't clear" bug.
- Implemented in `CommunitySidebarNav.tsx` using a module-level Map cache.

## 7.6 Key components (`src/components/community/`)
- `CommunitySidebarNav` — left-side server strip + channel list
- `ServerStrip` — vertical list of joined campaigns
- `ChannelChat` — main chat pane (restructured commit 45101db to match TicketPanel structure)
- `MessageInput` — composer with emoji / reply / file attach. Auto-focus **skipped on mobile** (commit 1bf293b) to stop iOS viewport shift
- `CallBanner` — live voice call indicator
- `VoiceRoom` — Jitsi embed
- `CallScheduler` — schedule future voice calls
- `DMToast` — toast on new DM
- `TicketPanel` — ticket chat (used as reference structure for ChannelChat)
- `MuteUserDialog` — mod mute with duration picker

## 7.7 Voice/Calls
- Jitsi-based via `@jitsi/react-sdk`.
- `ScheduledVoiceCall.roomId` is a random token.
- Status: `scheduled | live | completed | cancelled`.

## 7.8 Tickets
- Unique per (campaignId, userId) — one ticket thread per clipper per campaign.
- Status: `open | waiting | resolved | pending`.
- `lastMessageAt` indexed for sort.

## 7.9 DM toast system
- When a message arrives and the user is not on that channel, a toast pops via `sonner`.

## 7.10 Mute user dialog
- Staff-issued `CommunityModerationMute` with `expiresAt`. Blocks channel posting; tickets still work.

## 7.11 PAST campaigns hidden
- `/api/community/campaigns` filters `status !== "PAST"` for non-OWNER (commit `9e4a159`).

---

# SECTION 8 — RECENT SESSION WORK (Days 11-12 Post-Launch)

## 8.1 ✅ Reset tool admin restoration
- **Issue:** `danilo3520`'s role was `CLIPPER` so the reset tool soft-deleted them (`isDeleted=true`).
- **Fix SQL:**
  ```sql
  UPDATE users SET isDeleted=false, deletedAt=NULL WHERE username='danilo3520';
  UPDATE users SET role='ADMIN' WHERE username='danilo3520';
  ```
- **Bonus fix:** `reset-data` route crashed trying to use "ARCHIVED" which isn't in `CampaignStatus` enum. Fixed in commit `75f5525` to use valid status + match existing archive pattern (`isArchived=true`).

## 8.2 ✅ WWW redirect fix
- **Issue:** www.clipershq.com wasn't resolving because Namecheap had duplicate www CNAMEs.
- **Fix:** Deleted both CNAMEs, added Advanced DNS URL Redirect Record (permanent 301) → https://clipershq.com. Done in Namecheap control panel (not code).

## 8.3 ✅ Client invite localhost:8080 bug (commit `42d5ffd`)
- **File:** `src/app/api/auth/verify-magic-link/route.ts`
- **Problem:** `new URL(path, req.url)` on Railway resolves against internal bind `http://localhost:8080` because Railway proxies into localhost. The redirect Location header was `http://localhost:8080/client`.
- **Fix:** Added `publicBaseUrl(req)` helper: prefers `NEXTAUTH_URL`, then `x-forwarded-host` + `x-forwarded-proto`, then `req.url` as last resort.

## 8.4 ✅ Client invite 408 hang (commit `2996e8d`)
- **Three fixes:**
  1. `AbortController` 10s on Resend fetch in `src/lib/email.ts`
  2. Fire-and-forget email in magic-link routes (don't await)
  3. `export const maxDuration = 15` on magic-link routes

## 8.5 ✅ Agency earnings views drift (commit `cb8758d`)
- **Issue:** `AgencyEarning.views` is a denormalized snapshot from when earnings last updated. Between tracking runs it drifts from `ClipStat`.
- **Fix:** `/api/admin/agency-earnings` now reads live `ClipStat` views with `AgencyEarning.views` as fallback only if no stats exist.

## 8.6 ✅ P2034 earnings tx silent-swallow (commit `793b26d`)
- **Issue:** Cron path had no retry on P2034 (Serializable conflict). Manual checks had retry. Result: silent failure, stats grew but `Clip.earnings` pinned at old values.
- **Fix:** Unified retry loop (3 attempts, 500ms/1000ms exp backoff) on BOTH cron and manual. On final failure, loud `[TRACKING-RECALC-FAIL]` log with clip id, source, error code and message. Snapshot `initialNewEarnings`/`initialNewOwnerAmt` restored per attempt to prevent double-capping in ratio math.

## 8.7 ✅ OWNER force-recalc tool (commit `03ee6c6`)
- Endpoint: `/api/admin/force-recalc-earnings`
- UI: `/admin/force-recalc` with 3 panels:
  1. **Single clip** — recalc one clip by ID
  2. **Whole campaign** — recalc all clips in a campaign
  3. **Sitewide** — recalc ALL clips (requires typing `RECALC ALL`)
- Bypasses tracking paths (which can get stuck on P2034). Directly calls the recalc helpers.

## 8.8 ✅ Clip ID copy button (commit `1ebef94`)
- `/admin/clips` rows now have a copy-to-clipboard button for the clip `id` (OWNER/ADMIN only).
- Needed because force-recalc requires clip IDs and they weren't visible anywhere in the UI.

## 8.9 ✅ Past Campaigns Part 1 (commit `9e4a159`)
- Added `PAST` to `CampaignStatus` enum (SQL run).
- `/api/campaigns/past` endpoint — returns 20 most-recent PAST, trimmed shape.
- Horizontal scroll section on `/campaigns` (mobile peek ~15%).
- `CampaignCard isPast` prop: grayscale filter, "PAST" badge, non-clickable.
- Admin buttons: "Move to Past" / "Reactivate" on campaign detail.
- Tracking cron skips `status=PAST` (`where.clip.campaign.status.not = "PAST"` in `runDueTrackingJobs`).
- `/api/community/campaigns` hides PAST from non-OWNER.

## 8.10 ✅ Past Campaigns Part 2 — manual create (commit `5bec8eb`)
- `/admin/past-campaigns` dedicated page for OWNER.
- `POST /api/campaigns/past-create` — creates `status:PAST` campaign without any side effects (no community channels, no tracking jobs, no Discord broadcast).
- `manualSpent` column added (SQL run).
- `CampaignCard` uses `effectiveSpent = manualSpent` when `status=PAST`.
- Also has PATCH (edit) and DELETE (soft-delete via `isArchived`) on same route.

## 8.11 ✅ Community unread fix (commit `0e5af44`)
- **First attempt (`7b2ae23`):** modified ChannelChat to mark-read on scroll-to-bottom. **BROKE mobile UI** — reverted in `1fd531a`.
- **Second attempt (`0e5af44`):** 1-file change. Just dropped the `CommunitySidebarNav` cache TTL from 30s → 3s. Server-side mark-read (piggy-backed on GET messages) already worked correctly.

## 8.12 ✅ Mobile topbar stays visible on iOS keyboard (commit `588460c`)
- Made topbar `max-lg:fixed max-lg:top-0 z-40`.
- Added `max-lg:pt-14` to main content area for offset.

## 8.13 ⚠️ Community input cut-in-half bug — 6 ATTEMPTS, NOT FIXED
Commits tried:
- `a9972d8` — consistent layout before/after keyboard focus
- `afa9835` — attempted iOS initial load fix
- `52b06db` — safe-area-inset for home indicator
- `45101db` — restructured ChannelChat to match TicketPanel (working chat)
- `ed7bedc` — hid PWAInstallPopup on /community (thought it was overlapping)
- `1bf293b` — skip MessageInput auto-focus on mobile

Tried: `flex-1` vs `h-full`, `dvh` vs `svh`, safe-area-inset, match TicketPanel, gate PWAInstallPopup, skip mobile auto-focus.

**Status: ACCEPTED AS LIVED-WITH BUG.** User decided to move on.

**Root cause theorized (not confirmed):** `MessageInput.tsx:77` auto-focus triggers iOS layout-viewport scroll. Users tap input once and it works after first tap — just cosmetic on first render.

## 8.14 ✅ Referral Override feature (commit `178630d` + cleanup)
- `/admin/referral-override` page (OWNER only).
- `POST /api/admin/referral-override` with audit logging.
- Referred clipper gets 4% fee **on future clips only** (retro recalc on unpaid via `recalculateUnpaidEarnings`).
- Referrer earns 5% of **lifetime** `totalEarnings` including past paid clips — because `getReferralStats` is computed on-the-fly.
- Circular referral detection: `wouldCreateCycle(targetUserId, newReferrerId)` walks up 50 hops.
- SQL columns added: `referrerOverriddenBy TEXT`, `referrerOverriddenAt TIMESTAMP(3)`.
- **Cleanup fixed 5 bugs:**
  - BUG 1: keep banned referrer block
  - BUG 2+3: keep "Remove first, then Set" UX (no Change button)
  - BUG 4: removed no-op `recalculateUnpaidEarnings` call in DELETE path
  - BUG 5: fixed modal copy to accurate "future-only for clipper, lifetime for referrer"

## 8.15 ✅ Hide FLAGGED from clippers (commit `5dd9579`)
- `/api/clips/mine` sanitizes response: strips `fraudScore`, `fraudReasons`, `fraudCheckedAt`, maps `FLAGGED` → `PENDING`.
- Review route no longer SSE-publishes `FLAGGED` status to clipper (comment in review route explicitly explains).
- Audit found no email/Discord templates referenced "flagged".

**⚠️ POTENTIAL GAPS (LEAKs 1-5) — NOT YET FIXED:**

- **LEAK 1:** `/api/earnings` returns raw `status` — clipper would see FLAGGED here. Needs same sanitization as `/api/clips/mine`.
- **LEAK 2:** `computeBalance` in `src/lib/balance.ts` treats FLAGGED as invisible (filters only `status=APPROVED`) → FLAGGED clip's earnings vanish from balance while its card shows as PENDING. Confusing.
- **LEAK 3:** Earnings page client filter — auto-resolves if LEAK 1 fixed.
- **LEAK 4:** Streak `todayActivity` OR clause missing FLAGGED at `gamification.ts:314` — a FLAGGED clip today doesn't count toward today's streak even though UI says PENDING.
- **LEAK 5:** Leaderboard excludes FLAGGED (probably correct anti-fraud behavior — product decision).
- **COSMETIC:** `CLIP_FLAGGED` notification type is overloaded for community/tickets (video unavailable, fraud flagged, resurrected clip). Clipper shouldn't receive any of these, but if they do, the title "Clip flagged" would leak.

## 8.16 ✅ 500 Instagram OCR scraper (SEPARATE PROJECT)
- Standalone Python project at `C:\Users\Game Centar\OneDrive\Desktop\ig_ocr_extractor\`
- EasyOCR + PaddleOCR cross-validation, 10-column CSV output, Levenshtein fuzzy dedup.
- User dropped 500 images in `input/`, ~2-3hr processing expected.
- **Not in this repo** — don't confuse with ClippersHQ.

## Other recent commits (not called out above)
- `5e34cf0` feat: OWNER can force-void PAID payouts (added `VOIDED` to `PayoutStatus` enum)
- `7016789` fix: show mobile topbar on community — overlay offset below topbar
- `a45c0b8` feat: owner-only pre-launch data reset (soft-delete)
- `b93999d` fix: shorter campaign cards on mobile — 2 fit in viewport
- `a21a2fa` Revert "fix: campaigns 2-col on mobile, restore topbar on community"
- `ef6a6f2` fix: campaigns 2-col on mobile, restore topbar on community
- `fd9bca2` feat: 3 campaign image slots (card/banner/avatar) with react-easy-crop
- `cf75623` fix: community mobile layout root cause
- `c5d0138` fix: community chat mobile — port input mechanics from AI chat widget

---

# SECTION 9 — ENV VARS

**Architecture only — no secrets.**

## 9.1 All env vars referenced in src/
Grepped from `process.env.*`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `NEXTAUTH_URL` | Canonical public URL (https://clipershq.com) — used by `publicBaseUrl` helper |
| `AUTH_URL` | NextAuth v5 alt name (same value) |
| `AUTH_SECRET` | NextAuth signing secret |
| `AUTH_OWNER_EMAIL` | Auto-grants OWNER role on first sign-in with this email |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | Discord OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (conditional) |
| `DISCORD_BOT_TOKEN` | Bot that DMs clippers on campaign alerts |
| `DISCORD_GUILD_ID` | Guild where bot operates |
| `DISCORD_ALERT_ROLE_ID` | Role-ping for alerts |
| `EMAIL_API_KEY` | Resend API key |
| `EMAIL_FROM` | e.g. "Clippers HQ <noreply@clipershq.com>" |
| `APIFY_API_KEY` (also `APIFY_TOKEN`) | Apify auth |
| `APIFY_TIKTOK_ACTOR` | Override default `clockworks/tiktok-scraper` |
| `APIFY_INSTAGRAM_ACTOR` | Override default `apify/instagram-reel-scraper` |
| `APIFY_IG_PROFILE_ACTOR` | Override default `apify~instagram-profile-scraper` for profile verification |
| `ABLY_API_KEY` | Ably realtime |
| `ANTHROPIC_API_KEY` | AI chatbot |
| `YOUTUBE_API_KEY` | YouTube Data API |
| `BROWSERLESS_API_KEY` (or `BROWSERLESS_TOKEN`) | Screenshot verification fallback |
| `BROWSERLESS_URL` | Default `https://chrome.browserless.io` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Storage |
| `CRON_SECRET` | Bearer token required on `/api/cron/tracking` |
| `DEV_AUTH_BYPASS` | Dev-only auth bypass (rejected in production) |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | Client-side counterpart |
| `NODE_ENV` | Standard |

## 9.2 Local .env note
- Local `.env` had typo `NEXTAUTH_URL=https://clippershq.vercel.app` (TWO Ps, old Vercel URL). User corrected.
- Railway environment is authoritative — local only used for occasional dev scripts.

---

# SECTION 10 — GIT STATE

## 10.1 Current branch
**`main`** — tracks `origin/main`, up to date. Working tree clean.

## 10.2 HEAD
**`5dd9579d0d087c1a5b6f3723f68d5a9c050113a9`** — "fix: hide FLAGGED status and fraud fields from clipper view"

## 10.3 Recent 30 commits

```
5dd9579 fix: hide FLAGGED status and fraud fields from clipper view
178630d feat: /admin/referral-override — OWNER can set retroactive referrers
1bf293b fix: skip MessageInput auto-focus on mobile to stop iOS viewport shift
ed7bedc fix: hide PWAInstallPopup on /community so it stops covering chat input
45101db fix: ChannelChat matches TicketPanel's working chat structure
52b06db fix: community input no longer cut by iOS home indicator safe area
afa9835 fix: community chat input no longer cut in half on iOS initial load
a9972d8 fix: community chat layout consistent before/after keyboard focus
588460c fix: mobile topbar stays visible when iOS keyboard opens in community
0e5af44 fix: community sidebar unread badge clears within 3s of opening a channel
1fd531a Revert "fix: community unread clears when user scrolls to bottom of channel"
7b2ae23 fix: community unread clears when user scrolls to bottom of channel
5bec8eb feat: /admin/past-campaigns — create display-only past campaigns with manual spent field
2996e8d fix: client invite no longer hangs on slow Resend responses
42d5ffd fix: magic-link verify redirects to localhost behind Railway proxy
9e4a159 feat: Past Campaigns — new PAST status with horizontal scroll section
1ebef94 feat: copyable clip ID on admin/clips rows (OWNER/ADMIN only)
793b26d fix: retry P2034 earnings-tx up to 3 times on BOTH cron and manual (no more silent swallow)
03ee6c6 feat: OWNER force-recalc-earnings endpoint + UI (bypasses stuck-earnings paths)
cb8758d fix: agency-earnings reads live views from ClipStat (not stale AgencyEarning.views snapshot)
5e34cf0 feat: OWNER can force-void PAID payouts (for pre-launch test data cleanup)
7016789 fix: show mobile topbar on community — overlay offset below topbar
75f5525 fix: reset-data route uses valid CampaignStatus + matches existing archive pattern
a45c0b8 feat: owner-only pre-launch data reset (soft-delete, reversible)
b93999d fix: shorter campaign cards on mobile — 2 fit in viewport
a21a2fa Revert "fix: campaigns 2-col on mobile, restore topbar on community"
ef6a6f2 fix: campaigns 2-col on mobile, restore topbar on community
fd9bca2 feat: 3 campaign image slots (card/banner/avatar) with browser cropping via react-easy-crop
cf75623 fix: community mobile layout — root cause, no black space + input renders at full height on mount
c5d0138 fix: community chat mobile — port input mechanics from working AI chat widget
```

## 10.4 Tags

| Tag | Points at |
|---|---|
| `pre-chat-input-attempt-v2` | `45101db` |
| `pre-chat-height-fix` | `588460c` |
| `pre-reset-tool-2026-04-22` | `b93999d` |
| `pre-marketplace-2026-04-21` | `fd9bca2` |
| `checkpoint-20260419-172356` | older |
| `checkpoint-pre-card-redesign` | older |
| `community-live-v1` | older |
| `community-security-complete` | older |
| `community-complete` | older |

## 10.5 Pending changes
None — working tree clean.

---

# SECTION 11 — SQL RUN THIS SESSION

All via Supabase SQL Editor (not `prisma migrate`):

```sql
-- Reset tool soft-delete columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Restore danilo3520 after accidental soft-delete
UPDATE "users" SET "isDeleted" = false, "deletedAt" = NULL WHERE username = 'danilo3520';
UPDATE "users" SET role = 'ADMIN' WHERE username = 'danilo3520';

-- Past campaigns feature
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAST';

-- Manual spent for PAST display-only campaigns
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "manualSpent" DOUBLE PRECISION;

-- Referral override markers
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referrerOverriddenBy" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referrerOverriddenAt" TIMESTAMP(3);
```

Earlier additions (not this session but recent):
```sql
-- VOIDED payout status (commit 5e34cf0)
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- streakBonusPercentAtApproval (for streak lock snapshot)
ALTER TABLE "clips" ADD COLUMN IF NOT EXISTS "streakBonusPercentAtApproval" DOUBLE PRECISION;

-- Three image slots
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "cardImageUrl" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "bannerImageUrl" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "communityAvatarUrl" TEXT;

-- AI chatbot persisted quota
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aiMessageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aiQuotaResetAt" TIMESTAMP(3);

-- cron_locks table
CREATE TABLE IF NOT EXISTS "cron_locks" (
  "key" TEXT PRIMARY KEY,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
```

---

# SECTION 12 — LIVE CAMPAIGN STATUS

**First real campaign:** "somesome"
- Budget: **$900**
- Spent: **$360 (40%)**
- `clipperCpm`: **$2** (so $2 per 1000 clipper views)
- `ownerCpm`: **$1**
- Pricing model: `CPM_SPLIT`
- `maxPayoutPerClip`: **$200** clipper / **$100** owner
- 14 total clips, 6 active clippers, 5 approved, 8 pending
- 487K+ total views
- **One clip at 436K+ views still going viral** — overflow above cap is pure margin for OWNER

**Platform users:**
- OWNER: Danilo "Ankara" (digitalzentro@gmail.com)
- ADMIN: Dusan / dusan_ristic_ / Dacani98
- ADMIN: danilo3520 (briefly soft-deleted, restored)

---

# SECTION 13 — PENDING WORK / KNOWN ISSUES

## 13.1 Input bar cut-in-half on mobile community
**Status: accepted, moved on.** After 6 commits. User taps input once and it works after. Just cosmetic on first render.

## 13.2 FLAG-hiding LEAKs 1-5 (§8.15)
- **LEAK 1** `/api/earnings` not sanitizing status (HIGH priority — easy fix)
- **LEAK 2** `computeBalance` treats FLAGGED as invisible (MEDIUM — product decision: should FLAGGED earnings count as "pending balance" or not?)
- **LEAK 3** earnings page client filter (auto-fixes with LEAK 1)
- **LEAK 4** streak `todayActivity` OR clause missing FLAGGED at `gamification.ts:314` (MEDIUM — streak loss could feel unfair)
- **LEAK 5** leaderboard excludes FLAGGED (probably correct — product call)
- **COSMETIC** `CLIP_FLAGGED` notification type overloaded

## 13.3 Clipper UI redesign (biggest pending task)
User wants "10x better looking" clipper surface. Not started. Planning / design skill input needed.

## 13.4 Auto-update banner on new deploy
Proposed feature — detect when new version is deployed (via service-worker or server-sent check), show "Refresh for new version" banner. Not built.

## 13.5 Past campaigns feature
Shipped (commits `9e4a159` + `5bec8eb`) but user may not have fully tested the manual-create flow in prod yet.

## 13.6 TODO comments in code
None found. No `TODO|FIXME|XXX|HACK` matches in src.

---

# SECTION 14 — FUTURE PRODUCT ROADMAP

User-discussed features (not started):

## 14.1 Marketplace for edit services (9 services)
- Captions, Resize, Auto-cut, Background music remove, Voiceover, Animated subtitles, Background remove, Background music library, Export optimizer
- Infra: **Cloudflare R2** storage + 10h auto-cleanup + Railway worker service
- Build time: ~3 days bot work
- Infra cost: ~$40-55/mo

## 14.2 Clip Academy
$9/mo or 10% rev-share teaching platform.

## 14.3 Payout speed fee
Extra fee for instant payout.

## 14.4 Account marketplace
15% fee on account sales.

## 14.5–14.10 Additional ideas
- Campaign insurance
- Clipper loans
- Verified badge system
- Viral hook analyzer (AI tool)
- Clip Copilot (AI validator before submission)
- Auto-generated contracts

## 14.11 Analytics integrations
- **YouTube Analytics API** demographics — 1-2 days post-launch
- **Instagram Graph API** demographics — 3-5 days (business accounts only)
- **TikTok Research API** — blocked, months-long approval process

## 14.12 Autonomous 2-bot marketplace build
"Thinker Opus + Coder router" — planned for after launch settles.

---

# SECTION 15 — USER WORKFLOW + PREFERENCES

## 15.1 Communication style
- **Wants SHORT answers** — often in mobile chat interface.
- **Gets frustrated with long responses.**
- Wants push-back when ideas are bad.
- Wants **diagnosis BEFORE code changes**.
- English not first language — types fast, uses voice-to-text often.
- Uses profanity when frustrated — **don't match energy, stay calm**.

## 15.2 User context
- Max 5x plan ($100/mo Claude Code)
- Rolling 5hr window + weekly limit
- **Platform owner, not developer.** Don't assume dev background.
- Belgrade, Serbia — timezone CET/CEST
- Uses **iPhone** for testing
- Uses PWA installed version

## 15.3 Preferred workflow
1. Claude chat writes prompts
2. User pastes prompts to Claude Code (this agent)
3. User reports back with Claude Code's response
4. Claude chat audits + suggests next steps

## 15.4 Testing constraints
- **Tests on live site (no staging).**
- Railway auto-deploys on push to main.
- Deploy ~2-3 min.
- Sometimes needs hard refresh to see changes.
- Must run `npm run build` before and after every change.
- Every commit ends with `git push origin main` (never skip, per CLAUDE.md).

---

# SECTION 16 — TOOLING + DEV ENVIRONMENT

- Claude Code v2.1.114, Opus 4.7 (1M context), high effort
- claude-mem v12.3.2
- 21st-dev Magic MCP
- Bun 1.3.13 (build uses Node though — `prisma generate && next build`)
- Gmail MCP connected
- claude-code-router installed globally
- 26+ active Claude Code skills (listed in current context)
- Working directory: `C:\Users\Game Centar\OneDrive\Desktop\ClippersHQ`
- OS: **Windows 11 Pro** (some tools require bash shim — `.env.local` git-ignored)

---

# SECTION 17 — CRITICAL RULES + CONVENTIONS

## 17.1 CLAUDE.md summary (full file in Section 19.2)
- Next.js 14 App Router (actually 16.2.1, CLAUDE.md out of date)
- **npm run build before AND after every change** — mandatory
- **git add -A && git commit -m ... && git push origin main** after successful build
- NEVER skip push. NEVER ask permission to push.
- NEVER touch unrelated files
- NEVER use `prisma migrate` — only `prisma generate`
- NEVER commit `.env`, node_modules, audit reports
- Read files COMPLETELY before editing
- ONE focused change per task
- If fix requires touching 5+ files: **stop and plan first**

## 17.2 Styling conventions
- **Dark theme ONLY** (`--bg-page`, `--bg-card`, `--bg-card-hover`, `--border-color`, `--text-primary`, `--text-secondary`, `--text-muted`)
- **Accent color `#2596be`** — use `text-accent` / `bg-accent`
- Cards: `bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl`
- Icons: `text-accent`, **lucide-react only, never emoji**
- **No dashes as bullets.** Use `•` or left-border blocks.
- Buttons: `relative overflow-hidden active:scale-[0.97]` + ripple + `hapticLight()`
- Mobile-first: 375px → sm (640px) → md (768px) → lg (1024px)
- Modals: `backdrop-blur-md bg-black/60`
- Red button **only** for destructive actions

## 17.3 Typography
- Headings: `font-bold text-[var(--text-primary)]`
- Body: `text-sm text-[var(--text-secondary)]`
- Labels: `text-xs uppercase tracking-widest text-[var(--text-muted)]`
- Numbers/money: `font-bold text-accent`
- **Simple language** — write for a 15-year-old who never clipped before.

## 17.4 Code conventions
- TypeScript strict
- API routes: **always `NextResponse.json`**
- Dynamic routes: **`export const dynamic = "force-dynamic"`**
- Long-running: `export const maxDuration = 15` or 30
- OWNER-only endpoints: **re-check role against fresh DB read**, don't trust session.user.role
- Every API route: `getSession() + role check + checkBanStatus()`

## 17.5 Security patterns
- `checkBanStatus(session)` before any clipper-writing action
- `logAudit(...)` for every admin action
- Soft-delete (`isDeleted` / `isArchived`) — never hard delete user data
- CLIPPERs cannot see: `ownerCpm`, `agencyFee`, `clientName`, `aiKnowledge`, `bannedContent`
- CLIPPERs cannot access: `/api/admin/*`, `/api/campaigns/spend` full version
- CRON endpoint always requires `CRON_SECRET` regardless of NODE_ENV
- Budget operations use **Serializable** isolation level
- Payout creation checks for duplicates within 10 seconds
- Input validation on all POST/PATCH (no NaN, no negative numbers)
- File uploads validated by **magic bytes**, not just MIME
- `videoUnavailable: false` on ALL queries summing APPROVED clip earnings
- Always `take:` limits (500 for clips/users, 1000 for earnings, 5000 worst case)
- Rate-limit auth endpoints (3/hr for magic-link per email)

---

# SECTION 18 — CODEBASE SELF-AUDIT

## 18.1 Code quality — what's clean
- **Business logic separated cleanly into `src/lib/`** — earnings, gamification, fraud, referrals all pure-ish functions.
- **Long-form comments where it matters.** `tracking.ts`, `gamification.ts`, `referral-override/route.ts` all have solid explanations of *why* decisions were made.
- **Serializable transactions** correctly applied around budget math.
- **Row-based cron lock** solution (with documented rationale for not using advisory locks) is thoughtful.
- **Timezone-aware streak logic** handles fractional offsets (India/Nepal/Chatham) and DST correctly.
- **Audit logging + soft deletes** throughout.

## 18.2 Code quality — rough edges
- **CLAUDE.md says Next.js 14 but it's 16.2.1.** Probably Sonnet 4 training cutoff leak — update CLAUDE.md.
- **Lots of `(clip as any)` casts** in tracking.ts — the Prisma-generated types seem not to flow through cleanly with include/select narrowing. Could be cleaned with typed helpers.
- **Some route files are very long** (review/route.ts = 550 lines). Could split approval vs rejection vs flag into helper functions.
- **`src/app/api/admin/` has several one-off `fix-*` scripts** (fix-budget, fix-earnings, fix-tracking, fix-usernames, backfill-tracking) — tech debt from incidents. Could be consolidated under `/admin/maintenance` or removed if no longer needed.
- **Duplication of budget-cap math** — it exists in tracking.ts, review/route.ts, AND recalculateUnpaidEarnings in gamification.ts. Three places to change if logic shifts. Should factor to a `computeBudgetCappedEarnings` helper.

## 18.3 Inconsistent patterns
- **Some routes use `db.$transaction(async (tx) => ...)`, others use array form** — both work but reviewer context-switches.
- **Error handling inconsistent** — some routes return `NextResponse.json({error}, {status})`, others return empty arrays on error with 200 status.
- **`console.log` tagged prefixes** vary: `[TRACKING]`, `[BUDGET]`, `[RECALC]`, `[STREAK-AUDIT]`, `[EMAIL]` — good pattern but not all files follow it.

## 18.4 Security concerns
- **Rate limiting is per-Vercel-instance in-memory.** Scale-out would partially defeat it. Magic-link has DB-level backup which is correct — should apply to other hotspots (clip-submit, payout-request).
- **`session.user.role` trust** — most admin routes do the fresh DB re-check; some might not. Worth grep auditing.
- **No CSRF tokens visible** — relying on NextAuth session + SameSite cookie. Should be fine for state-changing POSTs.
- **User-supplied image URLs** (`cardImageUrl`) trimmed to 2000 chars but not URL-validated. An attacker could put `javascript:alert(1)` and it would render in `<img src>`. Needs `startsWith("https://")` guard.
- **`walletAddress` stored plaintext** — fine for crypto addresses (public by design) but worth documenting.
- **Signed uploads** via `/api/upload` — relies on Supabase magic-byte check.

## 18.5 Performance concerns
- **`recalculateUnpaidEarnings` fetches up to 5000 clips per user.** Large lazy-backfill `db.clip.update` inside the loop could create 5000 queries serially. N+1 risk.
- **Sitewide force-recalc** iterates every clip; no batching. Could time out on a big DB.
- **`getGamificationState` self-heals `totalEarnings`** on every read. Fine now; won't scale if users reach thousands of clips.
- **No composite index on `(userId, status, videoUnavailable)`** for the hot earnings aggregate. Schema has `(campaignId, status, videoUnavailable, isDeleted)` but not user-scoped.
- **Missing `take:` limit** in some places (e.g. `getReferralStats` fetches all referrals without limit).

## 18.6 Race conditions
- Budget math is protected by Serializable transactions + retry — good.
- **PayoutRequest 10s dedup check** is documented but not visible in code (might be in `payouts/route.ts` — not read in this session).
- **`updateStreak` is idempotent** so concurrent calls are fine.
- **Approval path double-runs streak update** (pre-lock, post-lock) — intentional per comment.

## 18.7 Ticking time bombs
- **P2034 retry limit of 3 attempts** — under heavy load (e.g. 20 clips approved in the same second), all three could conflict. Would leave stuck earnings. Mitigated by `[TRACKING-RECALC-FAIL]` loud log, but silent for review path.
- **30-day session lifetime** — no refresh mechanism; users get hard-kicked after 30 days.
- **Ably channel capability tokens** — no visible revocation if user is banned. A banned user might still receive realtime events until their token expires.
- **Supabase free/pro tier row limits** — no monitoring. With view tracking every 1-8h per clip, ClipStat grows fast.
- **`gamificationCache` in `src/lib/gamification.ts`** is per-instance; Railway scaling would desync.

## 18.8 Refactor candidates
- Split `tracking.ts` into `tracking-scheduler.ts` + `tracking-processor.ts` + `budget-math.ts`.
- Extract `computeBudgetCappedEarnings({clip, campaign, user, newEarnings})` shared helper.
- Unify `db.clip.update` paths that set earnings (3+ places).
- Consolidate `/api/admin/fix-*` endpoints into a single maintenance surface.
- Drop `gamificationCache` (or move to Redis when scale hits).
- Replace per-instance rate limiter with DB-backed (already have magic-link model pattern).

## 18.9 Tests
**No test files found.** No `vitest`, `jest`, `playwright`, or `__tests__/` anywhere. `npm run build` + manual testing on live site is the entire test pipeline. This is a known gap and explicitly the user's chosen tradeoff (small team, prod speed).

---

# SECTION 19 — FULL FILE DUMPS

> Critical files dumped verbatim (or first 100 + last 100 for very long files).

## 19.1 `prisma/schema.prisma`

See Section 4 for the annotated walkthrough. Full file is 907 lines. Key structural points already detailed in §4. To read the full file, use `Read prisma/schema.prisma`. Models in order:

```
Account, Session, VerificationToken
UserRole enum, UserStatus enum
User
Team, TeamMember, TeamCampaign
CampaignStatus enum (ACTIVE | PAUSED | COMPLETED | DRAFT | PAST)
Campaign
ClipAccountStatus enum, ClipAccount
CampaignAccount
ClipStatus enum (PENDING | APPROVED | REJECTED | ARCHIVED | FLAGGED)
Clip
AgencyEarning
ClipStat
TrackingJob
PayoutStatus enum (REQUESTED | UNDER_REVIEW | APPROVED | PAID | REJECTED | VOIDED)
PayoutRequest
ScheduledCall
CampaignAdmin
PendingEditStatus enum, PendingCampaignEdit
AuditLog
Note
Conversation, ConversationParticipant, Message
ChatKnowledge
CronLock
Notification
CampaignEvent
GamificationConfig
CampaignClient
MagicLinkToken
Channel, ChannelMessage
CampaignTicket, TicketMessage
ScheduledVoiceCall
ChannelReadStatus
CommunityMute, CommunityModerationMute
MessageReaction
CommunityActivity
```

## 19.2 `CLAUDE.md`

Already shown in full in the initial context. Key rules summarized in §17.

## 19.3 `src/lib/tracking.ts`

989 lines. Cannot fit inline here. Already summarized heavily in §5.1 above. The critical annotated structure:

- Lines 1-45: imports, module-level `MAX_APIFY_CALLS_PER_RUN=200`, `apifyCallsMade`, `trackingDeadlineAt`
- Lines 49-190: `getNextInterval` (tiered schedule + resurrection fraud check)
- Lines 192-219: `nextHourMark`, `roundToNextSlot`
- Lines 222-680: `processTrackingJob` — the main per-clip work including the Serializable + P2034 retry transaction block
- Lines 712-743: `acquireTrackingLock` / `releaseTrackingLock` (row-based lock on cron_locks)
- Lines 745-989: `runDueTrackingJobs` — the entry point, parallel-across-campaigns, sequential-within-campaign, final budget sweep

## 19.4 `src/lib/earnings-calc.ts`

Already in §5.2. Full content retrievable at src/lib/earnings-calc.ts.

## 19.5 `src/lib/balance.ts`

Full 141 lines already shown in §5.4 walkthrough. Pure functions.

## 19.6 `src/lib/gamification.ts`

847 lines. Structure:
- Cache: `gamificationCache` Map with 30s TTL
- `loadConfig()` — DB + defaults
- Day helpers: `dayBounds`, `dayBoundsForTz`, `dayBoundsFromStr`, `startOfUserLocalDay`, `shiftDateStr`, `addDays`, `sameDay`
- `evaluateDay`, `evaluateDayByStr`, `evaluateDayByBounds` — passed/failed/pending
- `updateStreak(userId)` — main logic, walks backwards from yesterday
- `getStreakDayStatuses(userId, days)` — array for UI grid
- `updateUserLevel(userId)` — recomputes level, triggers recalc
- `getGamificationState(userId)` — cached read with self-heal
- `computeGamificationState` — the actual computation
- `recalculateUnpaidEarnings(userId)` — the big one: group by campaign, per-clip budget-cap ratio split, respect `lastBudgetPauseAt` budget lock

## 19.7 `src/lib/referrals.ts`

Full 70 lines already shown in §5.8.

## 19.8 `src/lib/email.ts`

Full 378 lines already shown in §5.6. Template wrapper + each transactional email function.

## 19.9 `src/lib/fraud.ts`

Full 149 lines already shown in §5.5.

## 19.10 `src/components/community/ChannelChat.tsx`

Large component file. Restructured in commit `45101db` to match TicketPanel's working chat structure. To avoid bloating this report further, read directly when needed.

## 19.11 `src/components/community/MessageInput.tsx`

Auto-focus on line 77 skipped on mobile per commit `1bf293b`. Read directly when needed.

## 19.12 `src/components/layout/app-layout.tsx`

Wraps `/(app)/*` pages with sidebar + navbar. Swipe sidebar support on mobile. Read directly when needed.

## 19.13 `src/components/layout/sidebar.tsx`

Left nav. OWNER/ADMIN see admin links. CLIPPER sees clipper-only pages. Swipe-to-open on mobile. Read directly when needed.

## 19.14 `src/components/layout/navbar.tsx`

Top bar. Recent fix: `max-lg:fixed max-lg:top-0 z-40` for iOS keyboard visibility. Read directly when needed.

## 19.15 `src/components/ui/campaign-card.tsx`

Uses `isPast` prop for grayscale + PAST badge. Uses `effectiveSpent = manualSpent` for PAST campaigns. Read directly when needed.

## 19.16 `src/app/(app)/campaigns/page.tsx`

Lists active campaigns in grid + horizontal-scroll PAST strip. Read directly when needed.

## 19.17 `src/app/(app)/community/page.tsx`

Community overview. Read directly when needed.

## 19.18 `src/app/api/clips/mine/route.ts`

Full 63 lines. Sanitization logic shown in §8.15. Key:
```ts
const sanitized = clips.map((c: any) => {
  const { fraudScore, fraudReasons, fraudCheckedAt, ...rest } = c;
  return {
    ...rest,
    status: c.status === "FLAGGED" ? "PENDING" : c.status,
  };
});
```

## 19.19 `src/app/api/clips/[id]/review/route.ts`

549 lines. Complex. Summary:
- Auth + role check + ban check + rate limit (60/min)
- Parses `action` (APPROVED/REJECTED/FLAGGED/PENDING)
- ADMIN scoping via `getUserCampaignIds`
- Campaign state guard (cannot approve on archived/DRAFT/COMPLETED)
- On APPROVED: force-refresh streak → snapshot streakBonusPct (if not already locked) → Serializable transaction (budget cap ratio-split, write earnings + feePercentAtApproval + streakBonusPercentAtApproval + streakDayLocked + streakDayLockedAt + agencyEarning upsert) → P2034 returns 409 to client
- On APPROVED: broadcast `clip_updated` + `earnings_updated` via Ably, ensure TrackingJob exists/reactivate, send clip-approved email, create notification
- On REJECTED/PENDING: zero out earnings, delete AgencyEarning, deactivate TrackingJob (on REJECTED), streak warning email if last-safe clip of the day, consecutive-rejection warning at 3+
- Auto-resume check: if campaign was PAUSED with `lastBudgetPauseAt` and spent drops below budget, resume + reactivate tracking
- On FLAGGED: just set status, **do NOT publish SSE to clipper** (comment explains why)
- User sync: recompute totalEarnings/totalViews/level (skip for OWNER/ADMIN/override)
- Trust score delta: +5 approved, -10 rejected (skip for OWNER/ADMIN)
- Streak re-eval on approve/reject
- AuditLog write

## 19.20 `src/app/api/admin/referral-override/route.ts`

Full 285 lines already shown in §8.14 walkthrough. GET/POST/DELETE with cycle detection.

## 19.21 `src/app/api/auth/verify-magic-link/route.ts`

Full 106 lines already shown. `publicBaseUrl` helper fixes localhost redirect.

## 19.22 `src/app/api/auth/request-magic-link/route.ts`

Full 69 lines already shown. Rate-limited 3/hr per email in-memory + 3/hr DB-level via MagicLinkToken count. Fire-and-forget email.

## 19.23 `src/app/api/campaigns/past-create/route.ts`

Full 234 lines already shown in §19.23. GET/POST/PATCH/DELETE for PAST display-only campaigns.

## 19.24 `src/app/api/campaigns/past/route.ts`

Full 56 lines already shown. Trimmed-shape read endpoint.

## 19.25 `package.json`

```json
{
  "name": "clippers-hq",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "cron:tracking": "tsx scripts/run-tracking-cron.ts",
    "restore:deleted": "tsx scripts/restore-deleted.ts",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@auth/prisma-adapter": "^2.11.1",
    "@jitsi/react-sdk": "^1.4.4",
    "@prisma/adapter-pg": "^7.5.0",
    "@prisma/client": "^7.5.0",
    "@prisma/pg-worker": "^6.9.0",
    "@supabase/supabase-js": "^2.101.1",
    "ably": "^2.21.0",
    "clsx": "^2.1.1",
    "dotenv": "^17.3.1",
    "exceljs": "^4.4.0",
    "lucide-react": "^0.577.0",
    "next": "16.2.1",
    "next-auth": "^5.0.0-beta.30",
    "next-themes": "^0.4.6",
    "prisma": "^7.5.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-easy-crop": "^5.5.7",
    "recharts": "^3.8.1",
    "resend": "^6.10.0",
    "sharp": "^0.34.5",
    "sonner": "^2.0.7",
    "tsx": "^4.21.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.1",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

# SECTION 20 — OPEN QUESTIONS FOR NEW CHAT

These should be confirmed early with the user:

1. **Did you test the /admin/past-campaigns create/edit/delete flow end-to-end on production?** (Feature shipped but unclear if exercised.)
2. **Which LEAK fixes (§8.15) do you want applied, if any?** Especially LEAK 1 (`/api/earnings` status sanitization) and LEAK 4 (streak `todayActivity` missing FLAGGED).
3. **Is the clipper UI redesign the next major task, or something else?**
4. **Have you used the referral override yet in production?** (Feature is live but may not have seen real usage.)
5. **Is the community input cut-in-half mobile bug truly accepted, or do you want another attempt after a cooling-off period?**
6. **Auto-update banner on new deploy — still wanted?**
7. **Marketplace for edit services — still the highest future-roadmap priority, or shifted?**
8. **How is the "somesome" campaign performing? Any data/support issues after the 1-2 weeks of live traffic?**
9. **Is the CLAUDE.md Next.js version (says 14, actually 16.2.1) worth fixing, or leave as-is?**
10. **Should we audit the `/api/admin/fix-*` endpoints for removal, or keep them as maintenance tools?**

---

# CHANGELOG OF THIS HANDOFF REPORT

- **Generated:** 2026-04-24
- **Generated by:** Claude Code (Opus 4.7, 1M context)
- **Repo HEAD commit:** `5dd9579d0d087c1a5b6f3723f68d5a9c050113a9`
- **Repo branch:** `main`
- **Working tree:** clean
- **Report scope:** all 20 sections completed; file dumps Section 19 use summary-with-pointers approach for files > 200 lines (full reads are available to the new chat via the `Read` tool)
- **Sections with limited info:**
  - **§19.10 – §19.17** (components and pages): not fully dumped to keep report scannable; the new chat can `Read` them directly. All structural info is in §3, §5, §7.
  - **§18.9 (tests):** confirmed no test infrastructure exists.
  - **§13.6 (TODOs):** none found via grep.
- **Recommended next action for new chat:** read CLAUDE.md first, then start with the user's answers to the Section 20 questions.
