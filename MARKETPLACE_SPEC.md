# CLIP MARKETPLACE — FULL SPEC

## CONCEPT
Marketplace where POSTERS list their verified social accounts (TikTok/IG/YouTube) per campaign. CREATORS browse posters and submit videos via Google Drive links. Posters approve or deny. If approved and posted, earnings split 60% creator / 30% poster / 10% platform (HIDDEN). Same user can be both creator and poster — toggle UI tabs.

The "verified social account" referenced throughout this spec maps to the existing `ClipAccount` model in `prisma/schema.prisma` (table `clip_accounts`). It is NOT the NextAuth `Account` model (table `auth_accounts`, which holds OAuth tokens).

## REVENUE SPLIT
- Creator: 60%
- Poster: 30%
- Platform: 10% (hidden — neither side ever sees this number)
- Split happens at view-tracking time, same as regular CPM
- Owner approval REQUIRED before any earnings count
- Admin denies clip = nobody earns
- Counts toward streak/level/PWA bonuses (with timezone caveat below)

## ROLES
- POSTER: lists verified ClipAccounts per campaign, sets daily slot count (1-10)
- CREATOR: submits Google Drive links to posters
- Same user can do both — UI is 2 tabs (Find clips / Submit clips)
- Owner has THIRD tab: full dashboard, force-approve, force-reject, charts

## POSTER LISTING FIELDS
- ClipAccount (must be already verified on the site — references existing ClipAccount.id)
- Niche + audience % breakdown (free text)
- Follower count (poster enters, owner can override)
- Country + timezone
- Which campaigns they're available for
- Daily slot count (1-10, adjustable anytime)
- Multiple ClipAccounts allowed
- One ClipAccount can post in multiple campaigns (each requires separate owner approval)

## CREATOR SUBMISSION FIELDS
- Pick ONE poster listing
- Pick platforms (TikTok/IG/YouTube — must match campaign)
- Paste Google Drive link
- Optional notes
- Each platform = 1 slot filled (e.g., 1 clip on 3 platforms = 3 slots)
- Multiple different clips to same poster allowed
- Same Drive link cannot be active in 2 submissions simultaneously

## TIMING
- Poster has 24 hours to approve or deny submission
- Expires after 24h: poster sees "too slow", creator can resubmit elsewhere
- After approval, poster has 24 hours to actually post
- Reminders sent at 12h, 6h, 1h before expiry
- Miss the post window = strike (3-strike system)
- 3 strikes = 48-hour marketplace ban for poster

## STREAK + TIMEZONE LOGIC
- Each user's "day" follows their own DB timezone
- CREATOR streak: counts the day they SUBMIT (regardless of approval timing)
- POSTER streak: counts the day they actually POST
- Both judged on actions they control, not the other side's behavior

## DUPLICATE DETECTION
- System hashes Google Drive video metadata on submit
- Same hash submitted again = auto-block with clear message
- Active-submission lock: same Drive link cannot be in 2 pending submissions at once
- 3+ rejections on same video = auto-message creator with quality improvement guidance
- Owner gets alerts on suspicious patterns

## REJECTIONS
- Per-clip basis (poster cannot block a creator entirely)
- Reject reasons: predefined list + custom note for "what to improve"
- 24-hour cooldown applies ONLY to that specific poster (creator can submit to others)
- Creator sees rejection note privately

## RATINGS
- Poster rates creator 1-10 after clip posts
- System auto-tracks: average views per clip, post speed, completion rate
- Owner sees full rating history

## NOTIFICATIONS
- Email + in-app only (NO Discord)
- Both sides notified on submit, approve, deny, expire, payout
- Reminder emails at 12h/6h/1h before expiry

## COMMUNICATION
- Creator and poster can DM each other about clips (chat thread per submission)
- Owner sees all DMs in admin view

## BANNED ACCOUNT HANDLING
- Already-paid earnings: locked in, no clawback
- Unpaid earnings on banned/deleted videos: subtracted from balance

## POSTER PAUSE / DELETE
- Pause: listing disappears from creator browse, data preserved, can unpause anytime
- Delete: poster requests, owner manually approves permanent delete

## STORAGE
- Google Drive links only — no file uploads to platform
- System stores hash for duplicate detection but never the file itself

## UI PLACEMENT
- New top-level sidebar item "Marketplace" alongside Dashboard, Clips, Account
- Hidden behind feature flag MARKETPLACE_ENABLED + OWNER role check during build
- 2 tabs for users: Find clips (poster mode) / Submit clips (creator mode)
- 3rd tab for owner: full admin dashboard with charts
- Style inspiration: Facebook Marketplace — slick, addictive, idiot-proof

## EARNINGS DISPLAY
- Combined with regular CPM in main payout request (single $ total)
- Separate "Marketplace Earnings" breakdown section visible in earnings page
- Marketplace tab shows isolated marketplace earnings overview

## OWNER POWERS
- Force-approve any clip
- Force-reject + refund any clip
- Override any field on any listing
- See all DMs, all submissions, all ratings
- Charts: total marketplace earnings, top earners, active listings, submission volume, strike history
- Manage 3-strike bans

## OUT OF SCOPE FOR V1
- No leaderboard
- No featured posters (paid pinning)
- No trial period for creators
- No automated payment / no upfront cost
- No public activity feed (private only)
