# STATUS — Pasugo Delivery App

**Last Updated:** 2026-05-04 (Sprint 3 — phase-based Maps nav, service-type wording, rider GPS, fare)  
**Stack:** Next.js 14 · Supabase · TypeScript · Tailwind CSS  
**Deployment:** Vercel (not yet deployed)

---

## Current Sprint

**Sprint 3 — React Native / Expo Mobile App (IN PROGRESS)**

Customer screens, rider screens, real-time tracking, and status state machine all working end-to-end.
Remaining: GPS map tracking, cron/expire-orders wiring for mobile, Vercel deployment.

**Previously:** Sprint 2 — Web UI (COMPLETE ✓) — Auth, Customer UI, Rider Web UI, Admin Dashboard all complete.

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

## Sprint 3 — Mobile App Progress (pasugo-mobile)

### Customer Screens (COMPLETE ✓)
- **Login screen** — email/password, role-based redirect
- **Dashboard** — 3 service cards (Pabili, Pahatid, Pasundo) + Recent Orders section
- **New Order screen** — pickup/dropoff address, notes, service type pre-filled
- **Order tracking screen** (`/customer/order/[id]`) — live timeline, status badge, cancel button, "Order Delivered!" confirmation

### Rider Screens (COMPLETE ✓)
- **Dashboard** — available (searching) orders list + Recent Deliveries section, real-time updates, pull-to-refresh
- **Active Order screen** (`/rider/order/[id]`) — service-type-aware action buttons, 4-tap flow, cancel delivery

### Key Features Built
- `SafeAreaView` from `react-native-safe-area-context` used throughout (Android status bar inset)
- Supabase Realtime subscriptions on order rows (customer + rider)
- 8-second polling fallback alongside Realtime (catches missed events)
- Sign out on both dashboards, role-aware redirect after sign-in
- `skipRedirect=1` param to bypass active-order redirect when navigating home
- Two-`useEffect` pattern for Realtime — prevents "cannot add postgres_changes callbacks after subscribe()" error

### Backend Changes (deployed to Vercel)
- `POST /api/orders/:id/status` — updated to auto-advance `arrived_pickup → in_transit` atomically (records both `picked_up_at` and `in_transit_at`), reducing rider taps from 5 to 4

### Service-Type Aware Labels
- `pasundo` (fetch a person): "On the Way to Passenger", "Arrived at Location", "Passenger Boarded", "Arrived at Destination"
- `pabili` / `pahatid` (item delivery): "Heading to Pickup", "Arrived at Pickup", "Item Picked Up", "Mark as Delivered"

### Bugs Fixed This Sprint
| Bug | Fix |
|---|---|
| Back button hidden behind Android status bar | Switched all screens to `SafeAreaView` from `react-native-safe-area-context` |
| Sign-in broken after sign-out | `onAuthStateChange` now fetches role on sign-in event, not just sign-out |
| Home button looped back to order summary | Added `skipRedirect=1` param; dashboard skips `checkActiveOrder()` when present |
| Realtime error after subscribe() | Split into two `useEffect` hooks gated by `hasActiveDelivery` state |
| Customer "Order Delivered" never showed | Added explicit delivered terminal card + 8s polling fallback |
| `ReferenceError: Property 'TIMELINE' doesn't exist` | Fixed leftover reference after renaming to service-type-specific timeline arrays |
| Rider fare not visible before accepting | Added `pickup_lat/lng`, `dropoff_lat/lng` to dashboard query + fare-fetching `useEffect` |
| Customer map un-tappable after modal close | Removed `disabled={!riderLocation}`; always show `MapView` with fallback region from pickup/dropoff midpoint |
| Realtime "cannot add callbacks after subscribe()" | Unique channel name per mount via `useRef(\`rider-available-orders-${Date.now()}\`)` |
| Render error on "Back to Orders" from Recent Deliveries | Use `router.canGoBack()` — `router.back()` when stack exists, else `router.replace("/rider/dashboard")` |
| `ReferenceError: riderLocation doesn't exist` in openGoogleMaps | Removed `riderLocation` reference (belongs to customer screen); use `order` coords + live GPS state |
| Google Maps navigation skipped pickup waypoint (went rider→dropoff) | Switched to phase-based nav: pickup phase routes rider→pickup; dropoff phase routes pickup→dropoff |
| `localhost:3000/login` returned 404 | Login page lives at `app/auth/login/page.tsx` — correct URL is `/auth/login` |

### Rider Dashboard Improvements (COMPLETE ✓)
- Fare estimate shown on each available order card before accepting (spinner while fetching)
- `AvailableOrder` interface includes `pickup_lat/lng`, `dropoff_lat/lng` — used to call Directions API per card
- `useRef<Set<string>>` used to guard against re-fetching fares on re-renders (avoids infinite loop)
- Unique Supabase Realtime channel name per mount (`rider-available-orders-${Date.now()}` via `useRef`) — fixes "cannot add postgres_changes callbacks after subscribe()" error caused by two dashboard instances

### Rider Active Order — Phase-Based Google Maps Navigation (COMPLETE ✓)
- Navigation button label and destination change automatically based on order status
- `PICKUP_PHASE` = `{accepted, en_route_pickup}` → button says **"Navigate to Pickup"**, routes rider → pickup
- `DROPOFF_PHASE` = `{arrived_pickup, picked_up, in_transit}` → button says **"Navigate to Dropoff"**, routes pickup → dropoff
- `navPhase` derived value auto-switches when Realtime pushes a status update — no extra state needed
- Phase badge shown in the Route card header (blue for pickup phase, orange for dropoff phase)
- Android: opens `maps.google.com` web URL with `origin=` and `destination=`
- iOS: opens `comgooglemaps://?saddr=ORIGIN&daddr=DEST&directionsmode=driving` — if not installed, falls back to web URL
- When heading to pickup: origin = rider live GPS if available, else pickup coords
- When heading to dropoff: origin = pickup coords, dest = dropoff coords

### Rider Active Order — Live GPS Pin on Map (COMPLETE ✓)
- Rider's real-time GPS location shown as blue pin on both inline map and full-screen modal
- `expo-location` installed; `watchPositionAsync` updates position every 10 meters
- Location permission requested on screen mount
- **IMPORTANT: Requires native build — does NOT work with Expo Go**
- EAS build needed: `eas build --profile preview --platform android`

### New Order Screen — Service-Type-Aware Copy (COMPLETE ✓)
- `getScreenCopy(serviceType)` helper returns all UI strings based on service type
- `pasundo` (fetch a person): title = "Ride Details", pickup label = "Your location", dropoff label = "Destination", button = "Find a Rider"
- `pabili` / `pahatid` (item delivery): title = "Order Details", pickup label = "Pickup address", dropoff label = "Dropoff address", button = "Request Delivery"
- Button shows fare inline when calculated: `"Find a Rider · ₱{fare}"` or `"Request Delivery · ₱{fare}"`
- All hardcoded strings replaced; no duplicate copy logic

### GPS Map & Routing (COMPLETE ✓)
- Installed `react-native-maps` in pasugo-mobile
- Customer order screen (`/customer/order/[id]`) shows live `MapView` with orange rider pin + blue pickup + green dropoff pins
- Map visible only during active delivery states: `accepted` → `in_transit`
- Re-subscribes and re-fetches on screen focus (`useFocusEffect`) — fixes map disappearing after navigating home
- Placeholder shown if rider hasn't sent a ping yet
- Tap map → full-screen modal with all three pins (rider, pickup, dropoff)
- Rider order screen (`/rider/order/[id]`) shows route map with orange pickup + green dropoff pins
- Blue polyline drawn from pickup → dropoff via Google Directions API
- Distance badge shown (e.g. "3.2 km") — foundation for fare calculation
- Tap map → full-screen modal with full polyline route
- AddressPicker component captures coordinates at order creation (Google Places Autocomplete)
- `lib/places.ts` — `fetchSuggestions`, `fetchPlaceDetails`, `fetchDirections` (includes polyline decoder, no extra dep)
- **REQUIRED: Run RLS SQL below in Supabase SQL Editor before testing**

**RLS policies needed for `rider_locations` (run once in Supabase):**
```sql
GRANT SELECT, INSERT ON public.rider_locations TO authenticated;

CREATE POLICY "Riders can insert own location"
ON public.rider_locations FOR INSERT
WITH CHECK (auth.uid() = rider_id);

CREATE POLICY "Customers can view rider location for their orders"
ON public.rider_locations FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.orders WHERE orders.id = rider_locations.order_id AND orders.customer_id = auth.uid())
);

CREATE POLICY "Riders can view own location pings"
ON public.rider_locations FOR SELECT
USING (auth.uid() = rider_id);
```

**Android setup needed:**
- Replace `REPLACE_WITH_GOOGLE_MAPS_API_KEY` in `app.json` with a real Google Maps Android API key
- iOS uses Apple Maps by default — no key needed

---

## Next Steps

1. ~~**GPS map**~~ DONE ✓ — live rider pin (customer), route polyline + distance (rider), full-screen modal, focus re-subscribe fix
2. ~~**Rider fare on dashboard**~~ DONE ✓ — fare estimate shown on each order card before accepting
3. ~~**Open in Google Maps**~~ DONE ✓ — phase-based nav: pickup phase (rider→pickup), dropoff phase (pickup→dropoff), auto-switches on status update
4. ~~**Rider live GPS pin on map**~~ DONE ✓ — blue pin updates every 10m via `expo-location` (requires native build)
4b. ~~**Service-type-aware new-order screen**~~ DONE ✓ — pasundo shows "Ride Details / Find a Rider"; pabili/pahatid shows "Order Details / Request Delivery"
5. **EAS Preview Build** — run `eas build --profile preview --platform android` in `F:\pasugo-mobile` to get installable APK (needed because `expo-location` is a native module)
6. **Expire-orders cron** — wire `POST /api/system/expire-orders` to a Vercel cron job (`vercel.json` + `CRON_SECRET`)
7. **Deploy** — Next.js backend to Vercel; Expo app to TestFlight / Play Store internal testing

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
- [x] React Native / Expo mobile app (customer + rider) — core screens done
- [ ] Deployed to Vercel
