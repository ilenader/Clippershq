# CLIPPERS HQ — Claude Code Instructions

## What This Project Is
Clippers HQ (clipershq.com) is a SaaS platform connecting content clippers with brand campaigns across TikTok, Instagram Reels, and YouTube Shorts. Clippers earn CPM-based payouts. Owner: Danilo ("Ankara"). Admin: Dusan ("Dacani98").

## Stack
- Next.js 14 App Router, TypeScript, Tailwind CSS
- Supabase PostgreSQL, Prisma ORM (7.5.0)
- NextAuth v5 with Discord OAuth
- Resend for emails, Apify for video tracking
- Vercel Pro (Frankfurt/fra1)
- SSE for real-time updates

## BUILD & DEPLOY RULES — MANDATORY EVERY TIME
1. Run `npm run build` BEFORE starting any work (verify clean state)
2. Run `npm run build` AFTER finishing all changes (verify nothing broke)
3. If build fails, FIX IT before doing anything else
4. After successful build: `git add -A && git commit -m "descriptive message" && git push origin main`
5. NEVER skip the push. NEVER ask permission to push. Always push.

## CODE RULES — NEVER BREAK THESE
- NEVER touch files you weren't asked to touch
- NEVER change backend logic when asked for frontend changes
- NEVER change frontend when asked for backend changes
- NEVER remove functionality that already works
- NEVER add console.log for debugging without removing it after
- NEVER use `prisma migrate` — only `prisma generate`
- NEVER commit node_modules, .env files, or audit reports
- READ files COMPLETELY before editing them
- ONE focused change per task unless explicitly told to do multiple
- If something seems wrong but wasn't asked to fix, REPORT it but don't change it

## WHEN THINGS GO WRONG
- If build fails: read the error, fix ONLY the error, build again
- If you broke something: revert your change, don't try to patch on top
- If you're unsure: ask, don't guess
- If a fix requires touching 5+ files: stop and explain the plan first

## CSS & DESIGN SYSTEM
- Dark theme ONLY (no light theme support needed)
- Accent color: text-accent / bg-accent (#2596be) — use for ALL highlights
- ALWAYS use CSS variables, NEVER hardcode colors:
  - --bg-page, --bg-card, --bg-card-hover
  - --border-color
  - --text-primary (white), --text-secondary (muted white), --text-muted (dim)
- Cards: bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl
- All icons: text-accent (lucide-react icons only, never emojis)
- No dashes (-) as bullet points anywhere. Ever. Use • or left-border blocks.
- No emojis in production UI — use lucide-react icons styled in text-accent
- Buttons: already have relative overflow-hidden, active:scale-[0.97], ripple effect, hapticLight()
- Mobile first: design for 375px, then sm (640px), md (768px), lg (1024px)

## TYPOGRAPHY
- Headings: font-bold text-[var(--text-primary)]
- Body: text-sm text-[var(--text-secondary)]
- Labels: text-xs uppercase tracking-widest text-[var(--text-muted)]
- Numbers/money: font-bold text-accent
- Simple language — write for a 15-year-old who never clipped before

## DATABASE RULES
- Print SQL for owner to run in Supabase SQL Editor
- Always run `npx prisma generate` after schema changes
- Add `videoUnavailable: false` to ALL queries that sum APPROVED clip earnings
- Use Serializable transactions for any money-related operations
- Add `take:` limits to all findMany queries (500 for clips/users, 1000 for earnings)
- Add composite indexes for frequently queried field combinations

## SECURITY RULES
- Every API route MUST have: getSession() + role check + checkBanStatus()
- CLIPPERs cannot see: ownerCpm, agencyFee, clientName, aiKnowledge, bannedContent
- CLIPPERs cannot access: /api/admin/*, /api/campaigns/spend (full version)
- CRON endpoint always requires CRON_SECRET regardless of NODE_ENV
- Budget operations use Serializable isolation level
- Payout creation checks for duplicates within 10 seconds
- Input validation on all POST/PATCH endpoints (no NaN, no negative numbers)
- File uploads validated by magic bytes, not just MIME type

## EARNINGS & BUDGET SYSTEM
- Earnings = (views / 1000) × clipperCpm
- Owner earnings use BASE earnings, not bonus-inflated amounts
- Budget: clips from SAME campaign processed sequentially (race condition protection)
- Budget cap uses ratio-based split (clipper:owner by CPM ratio)
- When budget reached: campaign auto-pauses, sets lastBudgetPauseAt
- When clip rejected/undone AND campaign was budget-paused: auto-resume if spend < budget
- Manual pause: clears lastBudgetPauseAt (so auto-resume won't override)
- Platform fee: 9% standard, 4% for referred users
- Fee stored at approval time (feePercentAtApproval field)

## STREAK SYSTEM
- 24h local timezone day for each clipper
- Pending clips count as "safe" until rejected
- Approved clips lock the streak day permanently (streakDayLocked)
- No grace period — TODAY is never evaluated, only past days
- Freeze when no actively-posting campaigns
- Rejection + hours left: send warning email with countdown
- 3 consecutive rejections: send quality warning
- Manual restore: 36h protection window (streakRestoredAt)
- Streak milestones: 3d=+1%, 7d=+2%, 14d=+3%, 30d=+5%, 60d=+7%, 90d=+10%

## LEVEL SYSTEM
- Level 0: Rookie ($0, 0%)
- Level 1: Clipper ($300, +3%)
- Level 2: Creator ($1K, +6%)
- Level 3: Influencer ($2.5K, +10%)
- Level 4: Viral ($8K, +15%)
- Level 5: Icon ($20K, +20%)
- Levels are permanent — never reset

## VIDEO UNAVAILABILITY
- Apify returns "not found" → flag clip as videoUnavailable
- Earnings frozen to $0, savedEarnings preserves original amount
- Tracking slows to 24h checks
- If video comes back: auto-restore earnings and resume normal tracking
- Owner sees amber banner, decides manually what to do
- Flagged clips excluded from ALL earnings/budget/payout calculations

## ROLES
- OWNER: full access, sees everything, manages all campaigns
- ADMIN: manages assigned campaigns, cannot see agency earnings or owner data
- CLIPPER: sees own clips/earnings/campaigns, restricted API access
- CLIENT: (not yet built) read-only campaign viewer

## FILE STRUCTURE
- Pages: src/app/(app)/[page]/page.tsx (clipper), src/app/(app)/admin/[page]/page.tsx (owner/admin)
- API routes: src/app/api/[endpoint]/route.ts
- Shared components: src/components/ui/ (Button, Card, Badge, Modal, etc.)
- Business logic: src/lib/ (tracking.ts, gamification.ts, earnings-calc.ts, balance.ts, etc.)
- Layout: src/components/layout/ (navbar.tsx, sidebar via app-layout.tsx)

## PAGE PURPOSES (don't duplicate content across pages)
- Dashboard: quick glance — earnings, level, streak, clips today. NO charts, NO clip lists
- Clips: clip management hub — all clips, statuses, submit form
- Earnings: deep dive — charts, per-campaign breakdown, timeframe filtering
- Progress: gamification — streak grid, levels, bonuses, leaderboard
- Help: 12 collapsible sections, simple language, scannable with bold keywords
- Payouts: available balance, request form, payout history. NO earnings breakdown

## DOMAIN RULES
- One P: clipershq.com (NOT clippershq)
- Belgrade/Serbia never shown on any frontend page
- Browser tab title: just "Clippers HQ" on all pages

## DESIGN SKILLS AVAILABLE — USE THEM
- emil-design-eng: animations, transitions, easing
- design-taste-frontend: premium frontend patterns
- high-end-visual-design: visual quality
- frontend-design (Anthropic): production-grade UI
- react-best-practices (Vercel): component patterns
- web-design-guidelines (Vercel): layout and design
- webapp-testing: security patterns

## WHEN MAKING UI CHANGES
1. Read the relevant design skill SKILL.md files first
2. Check mobile (375px) layout after every change
3. Use existing CSS variables — never introduce new colors
4. Match the existing card/button/badge style exactly
5. Ensure all interactive elements have the press animation and ripple
6. Test that swipe sidebar still works after layout changes

## QUALITY CHECKLIST BEFORE EVERY COMMIT
- [ ] npm run build passes
- [ ] No TypeScript errors
- [ ] No hardcoded colors (search for hex codes)
- [ ] No console.log left behind (unless intentional logging with [TAG])
- [ ] Mobile layout not broken (mentally check 375px)
- [ ] No dashes used as bullets
- [ ] videoUnavailable: false on all earnings queries
- [ ] API routes have auth + role check + ban check
