# Marketplace Phase 4a — Smoke Test Plan

This document covers manual verification of the 5 submission API route files added in commit `6979a55`. Run these in order on production after Railway redeploys. All tests assume you are logged in as **OWNER** unless noted (Phase 4a is OWNER-gated).

## Setup

Replace placeholders as you go:

- `<HOST>` → `https://clipershq.com` (or staging)
- `<COOKIE>` → value of your `__Secure-authjs.session-token` cookie copied from devtools
- `<LISTING_ID>` → an `ACTIVE` `MarketplacePosterListing` whose `userId` is **NOT** the current session user (i.e. a listing belonging to another OWNER-test account; you cannot self-submit)
- `<SUB_ID>` → captured from Test 7's response

## Routes Covered

- POST/GET `/api/marketplace/submissions`
- GET `/api/marketplace/submissions/incoming`
- GET/PATCH/DELETE `/api/marketplace/submissions/[id]`
- POST `/api/marketplace/submissions/[id]/approve`
- POST `/api/marketplace/submissions/[id]/reject`

---

## Auth + role gate

### Test 1 — No session

Should return **401 "Please log in."**

```
curl -i <HOST>/api/marketplace/submissions -X POST -H "content-type: application/json" -d '{}'
```

### Test 2 — Non-OWNER role

Should return **403 "Owner only."** Run while logged in as a CLIPPER test account.

Same POST as Test 1 but with the clipper's cookie.

---

## POST /api/marketplace/submissions — validation

### Test 3 — Missing listingId

```
curl -i <HOST>/api/marketplace/submissions -X POST -H "content-type: application/json" -H "cookie: __Secure-authjs.session-token=<COOKIE>" -d '{}'
```

Expect **400 "listingId is required."**

### Test 4 — Missing/invalid driveUrl

Body `{ "listingId":"x" }` → **400 "driveUrl must be a valid Google Drive or Docs URL."**

### Test 5 — Non-Drive host

Body `driveUrl="https://example.com/x"` → **400** (host check fails).

### Test 6 — Empty platforms

`platforms=[]` → **400 "platforms must be a non-empty array."**

### Test 6b — Invalid platform value

`platforms=["FACEBOOK"]` → **400 "platforms must each be one of TIKTOK, INSTAGRAM, YOUTUBE."**

### Test 6c — notes too long

`notes` longer than 2000 chars → **400 `notes must be a string up to 2000 characters.`**

---

## POST happy path

### Test 7 — Successful create

Should return **201** with `{ submission }`.

```
curl -i <HOST>/api/marketplace/submissions -X POST -H "content-type: application/json" -H "cookie: ..." -d '{
  "listingId":"<LISTING_ID>",
  "driveUrl":"https://drive.google.com/file/d/abc123/view",
  "platforms":["TIKTOK","INSTAGRAM"],
  "notes":"first cut"
}'
```

Capture `<SUB_ID>`. Verify in Supabase:

```sql
SELECT id, status, "creatorId", "listingId", "expiresAt", "videoHash"
FROM marketplace_submissions
WHERE id = '<SUB_ID>';
```

- `status='PENDING'`
- `expiresAt ≈ now + 24h`
- `videoHash IS NULL` (Phase 4b will populate)

```sql
SELECT "totalSubmissions" FROM marketplace_poster_listings WHERE id='<LISTING_ID>';
```

`totalSubmissions` should have incremented by 1.

---

## POST listing/user guards

### Test 8 — Listing not ACTIVE

Body referencing a `PENDING_APPROVAL`, `PAUSED`, or `REJECTED` listing → **400 "Listing is not active. Only ACTIVE listings accept submissions."**

### Test 9 — Self-submission

Body `listingId` pointing at a listing **owned by you** → **400 "You cannot submit to your own listing."**

### Test 10 — Active duplicate

Re-POST the exact same `{ listingId, driveUrl, platforms }` payload as Test 7 → **409 "You already have a pending submission with this Drive link."**

A different `driveUrl` against the same listing should still succeed → **201**.

---

## GET /api/marketplace/submissions (mine)

### Test 11 — List own submissions

```
curl -i <HOST>/api/marketplace/submissions -H "cookie: ..."
```

Returns **200** with `{ submissions:[...], nextCursor }`. The list contains `<SUB_ID>`.

### Test 12 — Filter by status

`?status=PENDING` → only PENDING rows.

### Test 13 — Invalid status filter

`?status=BOGUS` → **400 "Invalid status filter."**

### Test 14 — Invalid limit

`?limit=999` → **400**. `?limit=0` → **400**. `?limit=abc` → **400**.

---

## GET /api/marketplace/submissions/incoming

### Test 15 — As listing owner

```
curl -i <HOST>/api/marketplace/submissions/incoming -H "cookie: ..."
```

When logged in as the owner of `<LISTING_ID>`, the response contains `<SUB_ID>`.

### Test 16 — Filter by listingId

`?listingId=<SOMEONE_ELSES_LISTING>` → empty array (filter is `listing.userId === me`).

### Test 17 — Same status/limit validation as Tests 13/14

Repeat with `status=BOGUS`, `limit=999` → **400** in each case.

---

## GET /api/marketplace/submissions/[id]

### Test 18 — As creator

Returns **200** with `{ submission }`.

### Test 19 — As listing owner

Returns **200**.

### Test 20 — As a third user (not OWNER, not creator, not listing owner)

Returns **404 "Not found."** (NOT 403 — leak prevention).

### Test 21 — Non-existent id

Returns **404**.

---

## PATCH editable while PENDING

### Test 22 — Update driveUrl

```
curl -i <HOST>/api/marketplace/submissions/<SUB_ID> -X PATCH -H "content-type: application/json" -H "cookie: ..." -d '{"driveUrl":"https://drive.google.com/file/d/xyz789/view"}'
```

**200**, row updated.

### Test 23 — Update platforms

`{ "platforms":["TIKTOK"] }` → **200**.

### Test 24 — Update notes

`{ "notes":"new note" }` → **200**. `{ "notes":null }` → **200**, notes nulled.

### Test 25 — Empty body

`{}` → **400 "No editable fields supplied."**

### Test 26 — Invalid driveUrl

`{ "driveUrl":"bad://url" }` → **400**.

### Test 27 — Empty platforms

`{ "platforms":[] }` → **400**.

### Test 28 — PATCH after approve

After approving the submission, PATCH → **400 "Cannot edit a submission in status APPROVED."**

### Test 29 — As a third user

→ **404**.

---

## DELETE

### Test 30 — Hard-delete while PENDING

```
curl -i <HOST>/api/marketplace/submissions/<SUB_ID> -X DELETE -H "cookie: ..."
```

**200** with `{ "ok": true }`. Row removed from `marketplace_submissions`.

### Test 31 — DELETE non-PENDING

→ **400 "Cannot delete a submission in status X."**

### Test 32 — DELETE as a third user

→ **404**.

---

## POST .../approve

### Test 33 — Listing owner approves PENDING

Create a fresh `<SUB2_ID>`. Then:

```
curl -i <HOST>/api/marketplace/submissions/<SUB2_ID>/approve -X POST -H "cookie: ..."
```

**200**. Verify:

- `status='APPROVED'`
- `approvedAt` set
- `postDeadline ≈ approvedAt + 24h`
- `marketplace_poster_listings.totalApproved` on `<LISTING_ID>` incremented
- `audit_logs` row with `action='MARKETPLACE_SUBMISSION_APPROVE'`, `targetId='<SUB2_ID>'`

### Test 34 — Approve already-APPROVED

Re-POST → **400 "Submission already APPROVED."**

### Test 35 — Approve expired

Manually set `expiresAt` to a past time:

```sql
UPDATE marketplace_submissions SET "expiresAt" = NOW() - INTERVAL '1 hour' WHERE id='<SUB3_ID>';
```

Then POST `/approve` → **400 "Submission expired."**

### Test 36 — Approve as a third user (not listing owner, not OWNER)

→ **404**.

---

## POST .../reject

### Test 37 — Reject without reason

Create fresh `<SUB3_ID>`. Body `{}` → **400 "reason is required and must be 1-1000 characters."**

### Test 38 — Reason too long

`reason` > 1000 chars → **400**.

### Test 39 — improvementNote too long

`improvementNote` > 1000 chars → **400 "improvementNote must be a string up to 1000 characters."**

### Test 40 — Reject happy path

```
curl -i <HOST>/api/marketplace/submissions/<SUB3_ID>/reject -X POST -H "content-type: application/json" -H "cookie: ..." -d '{"reason":"low quality"}'
```

**200**. Verify:

- `status='REJECTED'`
- `rejectedAt` set
- `rejectionReason='low quality'`
- `audit_logs` row with `action='MARKETPLACE_SUBMISSION_REJECT'`

### Test 41 — Reject already-REJECTED

→ **400 "Submission already REJECTED."**

### Test 42 — Reject expired

Same SQL trick as Test 35 → **400 "Submission expired."**

### Test 43 — Reject as a third user

→ **404**.

---

## Rate limits

OWNER bypasses rate limits by design. Skip these tests if you don't have a non-OWNER session ready (Phase 4a only allows OWNER through, but the limiter still meters per-key). Once Phase 11 opens to non-OWNER, retest:

### Test 44 — Hammer create

Make 21 `POST /api/marketplace/submissions` calls within an hour as a non-OWNER role. The 21st should return **429** with a `Retry-After` header.

---

## Database verification queries

Run in the Supabase SQL Editor between tests:

```sql
SELECT id, status, "creatorId", "listingId", "expiresAt", "approvedAt",
       "rejectedAt", "videoHash"
FROM marketplace_submissions
ORDER BY "createdAt" DESC
LIMIT 20;
```

```sql
SELECT id, "totalSubmissions", "totalApproved", "totalPosted"
FROM marketplace_poster_listings
WHERE id = '<LISTING_ID>';
```

```sql
SELECT id, action, "targetId", details, "createdAt"
FROM audit_logs
WHERE action LIKE 'MARKETPLACE_SUBMISSION_%'
ORDER BY "createdAt" DESC
LIMIT 20;
```
