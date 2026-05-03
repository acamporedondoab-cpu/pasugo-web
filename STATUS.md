# STATUS — Pasugo Delivery App

**Last Updated:** 2026-05-03  
**Stack:** Next.js 14 · Supabase · TypeScript · Tailwind CSS  
**Deployment:** Vercel (not yet deployed)

---

## Current Sprint

**Sprint 2 — Web UI (COMPLETE ✓)**

Phase 1 (Auth), Phase 2 (Customer UI), Phase 3 (Rider Web UI), Phase 4 (Admin Dashboard) all complete and verified.

**Next:** Sprint 3 — React Native / Expo mobile app (customer + rider)

---

## What Is Built

### Planning Phase (COMPLETE)
- Project purpose, users, and service types defined
- Core user flow designed (marketplace model — no dispatcher)
- CLAUDE.md and project_specs.md finalized
- Order state machine designed and approved (9 states)
- Full database schema designed (orders, profiles, order_status_logs, rider_locations)
- All API endpoints designed and documented in project_specs.md

---

### Database (COMPLETE)
- Supabase project created: `mzdyjvvoltgarhkdtevc`
- `profiles` table — auto-created on auth signup via `handle_new_user` trigger
- `orders` table — full schema with all state fields and timestamps
- `order_status_logs` table — append-only audit log per status change
- `expires_at` auto-set to `NOW() + 2 minutes` via DB default

**RLS (Row Level Security) — IN PROGRESS**

Policies applied so far:

`profiles`:
- Authenticated users can SELECT their own row (`auth.uid() = id`)

`orders`:
- Customers can INSERT their own orders (`customer_id = auth.uid()`)
- Users can SELECT orders they're involved in (`customer_id = auth.uid() OR rider_id = auth.uid()`)
- Users can UPDATE orders they're involved in
- Riders can SELECT all `searching` orders
- Riders can UPDATE (accept) `searching` orders where `rider_id IS NULL`
- Riders can release (rider-cancel) their own accepted orders back to `searching` or `failed`

`order_status_logs`:
- Authenticated users can INSERT logs they author (`actor_id = auth.uid()`)
- Users can SELECT logs for orders they're involved in

---

### API Endpoints (COMPLETE ✓)

| # | Endpoint | Status | Notes |
|---|---|---|---|
| 1 | `POST /api/orders` | DONE ✓ | Customer creates order |
| 2 | `POST /api/orders/:id/accept` | DONE ✓ | Rider accepts — atomic, concurrency-safe |
| 3 | `GET /api/orders/available` | DONE ✓ | Rider sees all searching orders |
| 4 | `POST /api/orders/:id/status` | DONE ✓ | Rider advances delivery status through all states |
| 5 | `GET /api/orders/:id` | DONE ✓ | Single order with full status log history |
| 6 | `POST /api/orders/:id/cancel` | DONE ✓ | Customer cancels (searching → arrived_pickup only) |
| 7 | `POST /api/orders/:id/rider-cancel` | DONE ✓ | Rider cancels, re-broadcasts; fails after 3 attempts |
| 8 | `POST /api/rider/location` | DONE ✓ | GPS ping during active delivery; validates active order |
| 9 | `POST /api/system/expire-orders` | DONE ✓ | Cron — mark timed-out orders as failed; service_role, bulk update |

---

### Auth (COMPLETE)
- Supabase Auth enabled (email/password)
- Test users created: `testcustomer@pasugo.dev`, `testrider@pasugo.dev`
- `handle_new_user` trigger auto-creates `profiles` row on signup
- `lib/supabase/server.ts` — SSR Supabase client (cookie-based, for browser)
- `lib/supabase/auth.ts` — `getUserFromRequest()` helper — supports both cookie auth (browser) and Bearer token auth (API/mobile)

---

## Bugs Encountered and Fixed

### 1. `next.config.ts` not supported in Next.js 14
**Error:** Next.js 14 does not support TypeScript config files (only Next.js 15+).  
**Fix:** Renamed to `next.config.mjs` and removed the TypeScript type annotation.

---

### 2. TypeScript error on `cookiesToSet` parameter
**Error:** Implicit `any` type on the `setAll` parameter in `lib/supabase/server.ts`.  
**Fix:** Imported `CookieOptions` from `@supabase/ssr` and added explicit type annotation.

---

### 3. Second user creation failed (`Database error creating new user`)
**Error:** `handle_new_user` trigger stored `''` (empty string) as phone for email-only users. UNIQUE constraint on `phone` rejected the second user.  
**Fix:** Made `phone` nullable. Updated trigger to use `NULLIF(COALESCE(NEW.phone, ''), '')`.

```sql
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone DROP DEFAULT;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, phone)
  VALUES (
    NEW.id, 'customer',
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(COALESCE(NEW.phone, ''), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 4. PowerShell `curl` is not real curl
**Error:** `curl` in PowerShell is an alias for `Invoke-WebRequest` with different syntax.  
**Fix:** Switched to `Invoke-RestMethod` with `@{ "key" = "value" }` hashtable headers.

---

### 5. API returned 401 despite valid Bearer token
**Root cause:** `@supabase/ssr` reads auth from cookies by default. Bearer token was only used for `getUser()` but all subsequent DB queries ran as `anon`.  
**Fix:** When Bearer token is present, create a plain `@supabase/supabase-js` client with `Authorization: Bearer <token>` in global headers so all queries carry the JWT.

```typescript
if (token) {
  const supabase = createBrowserClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user, error };
}
```

---

### 6. RLS blocking profile SELECT
**Error:** `authenticated` role had no table-level SELECT privilege on `profiles`.  
**Fix:**
```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
```

---

### 7. RLS blocking order INSERT and UPDATE
**Error:** After enabling RLS on `orders`, INSERT and UPDATE were blocked — no matching policies.  
**Fix:** Added policies for customers (INSERT), users (SELECT/UPDATE), riders (SELECT searching, UPDATE to accept).

---

### 8. RLS blocking rider-cancel (WITH CHECK violation)
**Error:** `new row violates row-level security policy for table "orders"` on rider-cancel.  
**Root cause:** The existing UPDATE policy's implicit `WITH CHECK` required `rider_id = auth.uid()` on the resulting row. Rider-cancel sets `rider_id = NULL`, so the check failed.  
**Fix:** Added a dedicated policy for rider cancellation:

```sql
CREATE POLICY "Riders can release orders back to searching"
ON public.orders
FOR UPDATE
USING (
  auth.uid() = rider_id
  AND status IN ('accepted', 'en_route_pickup', 'arrived_pickup')
)
WITH CHECK (
  rider_id IS NULL
  AND status IN ('searching', 'failed')
);
```

---

## Test Script

`test-api.ps1` — 15-step automated end-to-end test. Run after `npm run dev`:

```
Step 1:  Sign in as customer
Step 2:  Create order (searching)
Step 3:  Sign in as rider
Step 3b: Get available orders — order appears in list
Step 4:  Rider accepts order (accepted, rider_id locked)
Step 5:  Advance → en_route_pickup
Step 6:  Advance → arrived_pickup
Step 7:  Advance → picked_up
Step 8:  Advance → in_transit
Step 9:  Advance → delivered
Step 10: Get order with logs — 7 log entries returned
Step 11: Create second order for cancel test
Step 12: Customer cancels it (cancelled, cancelled_by: customer)
Step 13: Create third order for rider-cancel test
Step 14: Rider accepts it
Step 15: Rider cancels it (back to searching, search_attempts: 2)
```

**Last result:** ALL 15 STEPS PASSED ✓ (2026-05-03)

---

## Next Steps

1. Build React Native / Expo mobile app — Sprint 3
   - Customer app: create order, track delivery in real time
   - Rider app: receive order notifications, tap through status, GPS tracking
   - Same API endpoints and Supabase auth, no backend changes needed
2. Deploy web (Next.js) to Vercel + configure Vercel cron for expire-orders

---

## Order Lifecycle

```
searching → accepted → en_route_pickup → arrived_pickup
→ picked_up → in_transit → delivered

cancelled (customer cancels before pickup)
failed (timeout or rider abandons after pickup)
```

Full state machine and transition rules: see `project_specs.md`

---

## Definition of Done (MVP)

- [x] Customer can create a delivery request
- [x] Riders receive request in real time (Supabase Realtime)
- [x] Rider can accept order (atomic, concurrency-safe)
- [x] Order locks to first accepting rider
- [x] Rider can update delivery status through all states
- [x] Customer can track delivery in real time (Realtime timeline)
- [x] Edge cases handled (cancel, rider-cancel, re-broadcast, max retry → failed)
- [x] Order logs saved on every state change
- [x] GPS tracking active during delivery (pings every 5s)
- [x] Admin dashboard (orders, riders, stats, live updates)
- [ ] React Native / Expo mobile app (customer + rider)
- [ ] Deployed to Vercel
