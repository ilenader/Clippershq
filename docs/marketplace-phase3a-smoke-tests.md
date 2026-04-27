# Marketplace Phase 3a — Smoke Test Plan

This document covers manual verification of the 7 poster-listing API routes added in commit `f47ab8c`. Run these in order on production after Railway redeploys. All tests assume you are logged in as **OWNER** unless noted.

## Setup

Replace placeholders as you go:
- `<HOST>` → `https://clipershq.com` (or staging)
- `<COOKIE>` → value of your `__Secure-authjs.session-token` cookie copied from devtools
- `<CLIP_ACCOUNT_ID>` → an APPROVED, non-deleted ClipAccount you own
- `<CAMPAIGN_ID>` → an ACTIVE, non-archived Campaign that the ClipAccount has joined (CampaignAccount row exists)
- `<LISTING_ID>` → captured from Test 7's response

## Routes Covered

- POST/GET `/api/marketplace/listings`
- GET/PATCH/DELETE `/api/marketplace/listings/[id]`
- POST `/api/marketplace/listings/[id]/pause`
- GET `/api/marketplace/admin/listings`
- POST `/api/marketplace/admin/listings/[id]/approve`
- POST `/api/marketplace/admin/listings/[id]/reject`
- POST `/api/marketplace/admin/listings/[id]/override`

---

## Test 1 — Auth gate (no session)

Should return **401 "Please log in."**

```
curl -i <HOST>/api/marketplace/listings -X POST -H "content-type: application/json" -d '{}'
```

## Test 2 — Non-OWNER role tries to create

Should return **403 "Owner only."** Run while logged in as a CLIPPER test account if available.

Same POST request as Test 1 but with the clipper's session cookie.

## Test 3 — Validation: missing/invalid fields

Should return **400** with field-specific message.

```
curl -i <HOST>/api/marketplace/listings -X POST -H "content-type: application/json" -H "cookie: __Secure-authjs.session-token=<COOKIE>" -d '{}'
```

Try in turn:
- missing `clipAccountId`
- missing `campaignId`
- missing `niche`
- missing `audienceDescription`
- `followerCount: -1`
- `followerCount: 1e10` (over the 1B cap)
- `dailySlotCount: 11` (over 1-10 range)
- `niche` longer than 100 characters
- `audienceDescription` longer than 2000 characters

## Test 4 — ClipAccount ownership / status check

Should return **400 "Clip account not found, not approved, or not owned by you."**

POST a listing referencing:
- someone else's `ClipAccount.id`, OR
- a `PENDING` / `REJECTED` ClipAccount, OR
- a `deletedByUser: true` ClipAccount

## Test 5 — Campaign state check

Should return **400 "Campaign is not active. Only active, non-archived campaigns can host marketplace listings."**

POST referencing a `PAUSED`, `COMPLETED`, `DRAFT`, `PAST`, or `isArchived: true` campaign.

## Test 6 — CampaignAccount existence

Should return **400 "This account is not approved for this campaign yet. Submit it via the normal account flow first."**

POST referencing a clipAccount that has not joined the target campaign (no `CampaignAccount` row).

## Test 7 — Successful create

Should return **201** with `{ listing }`.

```
curl -i <HOST>/api/marketplace/listings -X POST -H "content-type: application/json" -H "cookie: ..." -d '{
  "clipAccountId":"<CLIP_ACCOUNT_ID>",
  "campaignId":"<CAMPAIGN_ID>",
  "niche":"gaming",
  "audienceDescription":"18-24 male, US/UK, gaming and tech",
  "followerCount":10000,
  "dailySlotCount":5
}'
```

Capture `<LISTING_ID>` from the response for later tests.

## Test 8 — Duplicate triggers 409

Repeat Test 7 with the same payload. Should return **409 "You already have a listing for this account on this campaign."**

## Test 9 — GET own listings

Should return **200** with `{ listings: [...] }` containing the row from Test 7.

```
curl -i <HOST>/api/marketplace/listings -H "cookie: ..."
```

## Test 10 — GET single listing as creator

Should return **200** with `{ listing }` (full record including `_count.submissions`).

```
curl -i <HOST>/api/marketplace/listings/<LISTING_ID> -H "cookie: ..."
```

## Test 11 — GET single listing as a different non-OWNER user

Should return **404 "Not found."** (NOT 403 — leak prevention). Run as a CLIPPER test session.

## Test 12 — PATCH editable fields

Should return **200** with updated row.

```
curl -i <HOST>/api/marketplace/listings/<LISTING_ID> -X PATCH -H "content-type: application/json" -H "cookie: ..." -d '{
  "niche":"updated niche",
  "dailySlotCount":7
}'
```

## Test 13 — PATCH forbidden field

Should return **400** with `Field "status" cannot be set via PATCH. Use the dedicated endpoint.`

```
curl -i <HOST>/api/marketplace/listings/<LISTING_ID> -X PATCH -H "content-type: application/json" -H "cookie: ..." -d '{"status":"ACTIVE"}'
```

Other forbidden fields: `approvedAt`, `approvedBy`, `followerOverride`, `rejectionReason`, `pausedAt`, `deletionRequestedAt`.

## Test 14 — Pause toggle

ACTIVE → PAUSED, PAUSED → ACTIVE.

First, approve the listing via Test 17 to make it `ACTIVE`. Then:

```
curl -i <HOST>/api/marketplace/listings/<LISTING_ID>/pause -X POST -H "cookie: ..."
```

Verify `listing.status` now `"PAUSED"` and `pausedAt` is set. Repeat → status `"ACTIVE"`, `pausedAt: null`.

## Test 15 — Pause toggle on PENDING_APPROVAL

Should return **400 "Cannot pause/unpause a listing in status PENDING_APPROVAL."**

Create a fresh listing (Test 7 with a new `{clipAccount, campaign}` pair), do NOT approve, then call the pause endpoint.

## Test 16 — DELETE request

Should return **200** with `status="DELETION_REQUESTED"` and an audit row written.

```
curl -i <HOST>/api/marketplace/listings/<LISTING_ID> -X DELETE -H "cookie: ..."
```

Verify audit log in Supabase:

```sql
SELECT * FROM audit_logs
WHERE action='MARKETPLACE_LISTING_DELETE_REQUEST' AND "targetId"='<LISTING_ID>';
```

## Test 17 — Admin approve

Should return **200** with `status="ACTIVE"`, `approvedAt`, `approvedBy`.

```
curl -i <HOST>/api/marketplace/admin/listings/<LISTING_ID>/approve -X POST -H "cookie: ..."
```

Verify audit log: `action='MARKETPLACE_LISTING_APPROVE'`.

## Test 18 — Admin approve a non-PENDING listing

Should return **400** `Cannot approve a listing in status ...`

Repeat Test 17. The listing is already `ACTIVE`.

## Test 19 — Admin reject without reason

Should return **400 "reason is required and must be 1-1000 characters."**

```
curl -i <HOST>/api/marketplace/admin/listings/<NEW_PENDING_LISTING_ID>/reject -X POST -H "content-type: application/json" -H "cookie: ..." -d '{}'
```

## Test 20 — Admin reject with reason

Should return **200** with `status="REJECTED"`, `rejectionReason` set.

```
curl -i <HOST>/api/marketplace/admin/listings/<NEW_PENDING_LISTING_ID>/reject -X POST -H "content-type: application/json" -H "cookie: ..." -d '{"reason":"Account quality not high enough yet."}'
```

Verify audit log entry: `action='MARKETPLACE_LISTING_REJECT'`.

## Test 21 — Admin override

Should return **200** and audit entry with `before`/`after` for only the touched fields.

```
curl -i <HOST>/api/marketplace/admin/listings/<LISTING_ID>/override -X POST -H "content-type: application/json" -H "cookie: ..." -d '{
  "followerOverride":50000,
  "dailySlotCount":3
}'
```

Verify audit `details` JSON contains `fields: ["followerOverride","dailySlotCount"]` and corresponding `before`/`after` maps.

## Test 22 — Admin list with filters and pagination

```
curl -i "<HOST>/api/marketplace/admin/listings?status=PENDING_APPROVAL&limit=10" -H "cookie: ..."
```

Should return up to 10 PENDING_APPROVAL listings with `nextCursor` set if more exist.

Verify cursor follow-up:

```
curl -i "<HOST>/api/marketplace/admin/listings?status=PENDING_APPROVAL&limit=10&cursor=<NEXT_CURSOR>" -H "cookie: ..."
```

## Test 23 — Admin list invalid limit

Should return **400 "limit must be an integer between 1 and 500."**

Try `?limit=999`, `?limit=0`, `?limit=abc`.

## Test 24 — Admin list invalid status filter

Should return **400 "Invalid status filter."**

Try `?status=BOGUS`.

## Test 25 — Admin endpoint as non-OWNER

Should return **403 "Owner only."** for all four admin routes (list, approve, reject, override). Run as CLIPPER or ADMIN test session.

## Test 26 — Rate limit

Hammer `mkt-listing-create` 11 times in under an hour as a non-OWNER role (rate limit applies; OWNER bypasses by design). The 11th call should return **429** with a `Retry-After` header.

Skip if you don't have a non-OWNER test session — OWNER bypasses rate limits.

---

## Database Verification Queries

Run in Supabase SQL Editor between tests:

```sql
SELECT id, status, "userId", "clipAccountId", "campaignId",
       "approvedAt", "approvedBy", "rejectionReason"
FROM marketplace_poster_listings
ORDER BY "createdAt" DESC
LIMIT 20;
```

```sql
SELECT id, action, "targetId", details, "createdAt"
FROM audit_logs
WHERE action LIKE 'MARKETPLACE_%'
ORDER BY "createdAt" DESC
LIMIT 20;
```
