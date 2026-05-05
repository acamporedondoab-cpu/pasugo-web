# Pasugo App — API Design

**Status**: Design only. No code written yet.
**Based on**: Approved order state machine + approved database schema (both locked).

---

## Overview

11 endpoints total across 4 groups.

| # | Group | Endpoint | Method |
|---|---|---|---|
| 1 | Customer | Create order | POST |
| 2 | Customer | Get own orders | GET |
| 3 | Customer | Get single order | GET |
| 4 | Customer | Cancel order | POST |
| 5 | Rider | Go online / offline | POST |
| 6 | Rider | Get available orders | GET |
| 7 | Rider | Accept order | POST |
| 8 | Rider | Update delivery status | POST |
| 9 | Rider | Cancel accepted order | POST |
| 10 | GPS | Submit location ping | POST |
| 11 | System | Expire timed-out orders | POST |

---

## Auth Pattern

All endpoints use Supabase JWT auth. The `role` field on the `profiles` table controls access.

| Role value | Who | Access level |
|---|---|---|
| `customer` | End user placing orders | Customer endpoints only |
| `rider` | Motorcycle rider | Rider + GPS endpoints |
| `operator` | Monitoring only | Read access (future dashboard) |
| `admin` | Platform admin | All (future dashboard) |

Every API route must:
1. Verify the JWT is valid via Supabase server-side client
2. Check the caller's `role` matches what the endpoint requires
3. Enforce ownership — a customer can only act on their own orders; a rider can only act on orders assigned to them

---

## Standard Response Shape

### Success
```
{
  "data": { ... },
  "message": "string (optional)"
}
```

### Error
```
{
  "error": "string — machine-readable code",
  "message": "string — human-readable explanation"
}
```

### Common HTTP Status Codes Used

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request — missing or invalid input |
| 401 | Unauthenticated — no valid JWT |
| 403 | Forbidden — authenticated but wrong role or ownership |
| 404 | Not found |
| 409 | Conflict — concurrency clash (order already taken) |
| 422 | Unprocessable — valid input but invalid business logic (e.g., cancelling a delivered order) |
| 500 | Internal server error |

---

## GROUP 1 — CUSTOMER ENDPOINTS

---

### 1. Create Order

```
POST /api/orders
Role required: customer
```

**Purpose**: Customer submits a new delivery request. The order is inserted with `status = 'searching'` and immediately visible to all online riders via Supabase Realtime.

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `service_type` | string (enum) | Yes | `pabili`, `pahatid`, or `pasundo` |
| `pickup_address` | string | Yes | Human-readable address |
| `pickup_lat` | number | Yes | Latitude |
| `pickup_lng` | number | Yes | Longitude |
| `dropoff_address` | string | Yes | Human-readable address |
| `dropoff_lat` | number | Yes | Latitude |
| `dropoff_lng` | number | Yes | Longitude |
| `notes` | string | No | Customer instructions |

**Server-Side Logic**
1. Validate all required fields are present
2. Verify caller has `role = 'customer'`
3. INSERT into `orders`:
   - `customer_id` = caller's user id
   - `status` = `searching`
   - `expires_at` = `now() + interval '2 minutes'`
   - `search_attempts` = `1`
4. INSERT into `order_status_logs`:
   - `from_status` = `null` (first entry)
   - `to_status` = `searching`
   - `actor_id` = customer id
   - `actor_role` = `customer`

**Success Response — 201**
```json
{
  "data": {
    "id": "uuid",
    "status": "searching",
    "service_type": "pabili",
    "pickup_address": "...",
    "pickup_lat": 14.5995,
    "pickup_lng": 120.9842,
    "dropoff_address": "...",
    "dropoff_lat": 14.6010,
    "dropoff_lng": 120.9860,
    "notes": null,
    "expires_at": "2024-01-01T00:02:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 400 | `MISSING_FIELDS` | Required field absent |
| 400 | `INVALID_SERVICE_TYPE` | Value not in enum |
| 401 | `UNAUTHORIZED` | No valid JWT |
| 403 | `FORBIDDEN` | Caller is not a customer |

**Realtime Trigger**
INSERT on `orders` → Supabase Realtime fires → all online riders subscribed to `orders:broadcast` receive the new order instantly. No extra push needed.

---

### 2. Get Own Orders

```
GET /api/orders
Role required: customer
```

**Purpose**: Customer fetches their own order list — active orders and past history.

**Query Parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `type` | string | `all` | `active`, `history`, or `all` |
| `page` | number | `1` | Pagination |
| `limit` | number | `20` | Max rows per page (cap at 50) |

**Active** = statuses: `searching`, `accepted`, `en_route_pickup`, `arrived_pickup`, `picked_up`, `in_transit`

**History** = statuses: `delivered`, `cancelled`, `failed`

**Server-Side Logic**
1. Verify caller is `customer`
2. SELECT from `orders` WHERE `customer_id = caller id`
3. Apply `type` filter if provided
4. Order by `created_at DESC`
5. Apply pagination

**Success Response — 200**
```json
{
  "data": {
    "orders": [ { "id": "...", "status": "...", "created_at": "..." } ],
    "total": 12,
    "page": 1,
    "limit": 20
  }
}
```

**Realtime Trigger**: None — this is a pull request. Active order status is tracked via Realtime subscription on the client.

---

### 3. Get Single Order

```
GET /api/orders/:id
Role required: customer (own order) | rider (assigned order) | operator | admin
```

**Purpose**: Fetch complete details of one order, including its full status log history. Used by both the customer tracking screen and rider delivery screen.

**URL Parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | uuid | Order ID |

**Server-Side Logic**
1. SELECT order by `id`
2. Check ownership:
   - If caller is `customer`: must be `customer_id = caller id`
   - If caller is `rider`: must be `rider_id = caller id`
   - If caller is `operator` or `admin`: allowed
3. Also SELECT all rows from `order_status_logs` WHERE `order_id = id` ORDER BY `created_at ASC`
4. Return combined response

**Success Response — 200**
```json
{
  "data": {
    "id": "uuid",
    "status": "in_transit",
    "service_type": "pahatid",
    "customer_id": "uuid",
    "rider_id": "uuid",
    "pickup_address": "...",
    "dropoff_address": "...",
    "notes": "Gate code: 1234",
    "is_delayed": false,
    "search_attempts": 1,
    "created_at": "...",
    "accepted_at": "...",
    "picked_up_at": "...",
    "in_transit_at": "...",
    "status_logs": [
      { "from_status": null, "to_status": "searching", "actor_role": "customer", "created_at": "..." },
      { "from_status": "searching", "to_status": "accepted", "actor_role": "rider", "created_at": "..." }
    ]
  }
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Customer trying to view another customer's order |
| 404 | `ORDER_NOT_FOUND` | No order with this ID |

**Realtime Trigger**: None — the client subscribes directly to Realtime for live updates after the initial fetch.

---

### 4. Cancel Order (Customer)

```
POST /api/orders/:id/cancel
Role required: customer (own order only)
```

**Purpose**: Customer cancels their order. Only allowed before the rider picks up the item. This is the customer's last action before `picked_up` locks the order.

**URL Parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | uuid | Order ID |

**Request Body**: None required. The cancellation actor is derived from the authenticated caller.

**Cancellation is allowed in these states only**

| Current Status | Allowed? |
|---|---|
| `searching` | Yes |
| `accepted` | Yes |
| `en_route_pickup` | Yes |
| `arrived_pickup` | Yes (last chance) |
| `picked_up` | **No** — item already in rider's hands |
| `in_transit` | **No** |
| `delivered` | **No** |
| `cancelled` | **No** |
| `failed` | **No** |

**Server-Side Logic**
1. Verify caller is `customer` and `customer_id = caller id`
2. Fetch current order status
3. If status is `picked_up`, `in_transit`, `delivered`, `cancelled`, or `failed` → 422 error
4. UPDATE `orders`:
   - `status` = `cancelled`
   - `cancelled_by` = `customer`
   - `cancelled_at` = `now()`
5. INSERT into `order_status_logs`:
   - `from_status` = previous status
   - `to_status` = `cancelled`
   - `actor_id` = customer id
   - `actor_role` = `customer`
   - `reason` = `customer_request`

**Success Response — 200**
```json
{
  "data": {
    "id": "uuid",
    "status": "cancelled",
    "cancelled_by": "customer",
    "cancelled_at": "2024-01-01T00:03:00Z"
  },
  "message": "Order cancelled successfully."
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Caller doesn't own this order |
| 404 | `ORDER_NOT_FOUND` | No order with this ID |
| 422 | `CANCEL_NOT_ALLOWED` | Status is picked_up or later |

**Realtime Trigger**
UPDATE on `orders` → if a rider was assigned, their subscription receives the status change and their UI shows "Order was cancelled by customer."

---

## GROUP 2 — RIDER ENDPOINTS

---

### 5. Go Online / Offline

```
POST /api/rider/online
POST /api/rider/offline
Role required: rider
```

**Purpose**: Controls the rider's broadcast eligibility. Only `is_online = true` riders appear in the order feed. Going offline also records the last known location for proximity use later.

**Request Body (both endpoints)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `lat` | number | No | Current latitude |
| `lng` | number | No | Current longitude |

**Server-Side Logic — `/online`**
1. Verify caller is `rider`
2. UPDATE `rider_profiles` WHERE `id = caller id`:
   - `is_online` = `true`
   - `last_seen_at` = `now()`
   - If lat/lng provided: update `last_known_lat`, `last_known_lng`
3. Return updated rider profile

**Server-Side Logic — `/offline`**
1. Verify caller is `rider`
2. UPDATE `rider_profiles` WHERE `id = caller id`:
   - `is_online` = `false`
   - `last_seen_at` = `now()`
   - If lat/lng provided: update `last_known_lat`, `last_known_lng`
3. Return updated rider profile

**Success Response — 200**
```json
{
  "data": {
    "id": "uuid",
    "is_online": true,
    "last_seen_at": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not a rider |
| 404 | `RIDER_PROFILE_NOT_FOUND` | No rider_profile row exists for this user |

**Realtime Trigger**: None — `rider_profiles` is not in the Realtime publication.

---

### 6. Get Available Orders

```
GET /api/orders/available
Role required: rider
```

**Purpose**: Riders call this once when they open the app or come online to get the current list of `searching` orders. After this initial load, all new and updated orders arrive via Realtime subscription — no polling needed.

**Query Parameters**: None for MVP. Future: `lat`, `lng`, `radius_km` for proximity filtering.

**Server-Side Logic**
1. Verify caller is `rider` and `is_online = true`
2. SELECT from `orders` WHERE `status = 'searching'`
3. ORDER BY `created_at ASC` (oldest first — fairness)
4. Return list

**Success Response — 200**
```json
{
  "data": {
    "orders": [
      {
        "id": "uuid",
        "service_type": "pabili",
        "status": "searching",
        "pickup_address": "...",
        "pickup_lat": 14.5995,
        "pickup_lng": 120.9842,
        "dropoff_address": "...",
        "notes": "Buy 1 kilo of rice",
        "created_at": "..."
      }
    ]
  }
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not a rider |

**Realtime Trigger**: None — this is the initial pull. From this point on, the rider's app subscribes to the `orders:broadcast` channel and receives all INSERT and UPDATE events where `status = 'searching'`.

---

### 7. Accept Order

```
POST /api/orders/:id/accept
Role required: rider
```

**Purpose**: Rider claims an order. This is the most critical endpoint in the system — it must be concurrency-safe. Only the first rider to call this wins. All others receive a 409.

**URL Parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | uuid | Order ID to accept |

**Request Body**: None. `rider_id` is derived from the authenticated caller's JWT.

**Concurrency-Safe Logic**

The accept action executes a single atomic conditional UPDATE in PostgreSQL. This is the only way to guarantee exactly one rider wins under simultaneous requests.

```
UPDATE orders
SET
  status     = 'accepted',
  rider_id   = :caller_id,
  accepted_at = now()
WHERE
  id        = :order_id
  AND status    = 'searching'    ← guard: only searching orders can be accepted
  AND rider_id  IS NULL          ← guard: not already taken
RETURNING *
```

- If RETURNING returns **1 row** → this rider won. Proceed to write the log.
- If RETURNING returns **0 rows** → another rider already accepted, or the order expired/was cancelled. Return 409.

**Server-Side Logic (full sequence)**
1. Verify caller is `rider`
2. Execute the atomic conditional UPDATE above
3. If 0 rows returned:
   - Fetch order to determine why (expired? already accepted?)
   - Return 409 with appropriate message
4. If 1 row returned:
   - INSERT into `order_status_logs`:
     - `from_status` = `searching`
     - `to_status` = `accepted`
     - `actor_id` = rider id
     - `actor_role` = `rider`
   - Return the full updated order

**Why this must be a server-side API route, not a direct Supabase client call:**
RLS policies alone cannot enforce the atomic conditional UPDATE. If a client calls Supabase directly, two simultaneous requests could both pass the RLS check and both set `rider_id`. The server-side route ensures the conditional WHERE clause runs atomically inside PostgreSQL.

**Success Response — 200**
```json
{
  "data": {
    "id": "uuid",
    "status": "accepted",
    "rider_id": "uuid",
    "accepted_at": "2024-01-01T00:01:30Z",
    "customer_id": "uuid",
    "service_type": "pasundo",
    "pickup_address": "...",
    "dropoff_address": "...",
    "notes": null
  },
  "message": "Order accepted. Head to pickup location."
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not a rider |
| 404 | `ORDER_NOT_FOUND` | No order with this ID |
| 409 | `ORDER_ALREADY_TAKEN` | Another rider accepted first (0 rows returned by UPDATE) |
| 409 | `ORDER_NOT_AVAILABLE` | Order is no longer in 'searching' state |

**Realtime Trigger**
UPDATE on `orders` fires → customer's subscription receives the status change → customer UI shows "Rider found!" with rider info.
The order also disappears from all other riders' `searching` feed because the `status` is no longer `searching`.

---

### 8. Update Delivery Status

```
POST /api/orders/:id/status
Role required: rider (assigned rider only)
```

**Purpose**: Rider advances the order through the delivery states after accepting. Each tap on the rider's UI calls this endpoint with the next status.

**URL Parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | uuid | Order ID |

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string (enum) | Yes | Must be a valid next state (see table below) |

**Valid Transitions From This Endpoint**

Only rider-initiated forward transitions are allowed here. Cancellation and failure have their own endpoints.

| From | To | Timestamp set |
|---|---|---|
| `accepted` | `en_route_pickup` | `en_route_at` |
| `en_route_pickup` | `arrived_pickup` | `arrived_pickup_at` |
| `arrived_pickup` | `picked_up` | `picked_up_at` |
| `picked_up` | `in_transit` | `in_transit_at` |
| `in_transit` | `delivered` | `delivered_at` |

Any other transition → 422 error.

**Server-Side Logic**
1. Verify caller is `rider`
2. Fetch order; verify `rider_id = caller id` (assigned rider only)
3. Verify the requested transition is in the valid transitions table above
4. UPDATE `orders`:
   - `status` = requested status
   - Set the corresponding timestamp column to `now()`
5. INSERT into `order_status_logs`:
   - `from_status` = previous status
   - `to_status` = new status
   - `actor_id` = rider id
   - `actor_role` = `rider`

**Success Response — 200**
```json
{
  "data": {
    "id": "uuid",
    "status": "picked_up",
    "picked_up_at": "2024-01-01T00:08:00Z"
  },
  "message": "Status updated to picked_up."
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 400 | `INVALID_STATUS` | Requested status not in enum |
| 403 | `FORBIDDEN` | Caller is not the assigned rider |
| 404 | `ORDER_NOT_FOUND` | No order with this ID |
| 422 | `INVALID_TRANSITION` | Requested status is not the valid next state |

**Realtime Trigger**
UPDATE on `orders` fires → customer's subscription receives each status change → customer's tracking UI advances in real time without any polling.

---

### 9. Rider Cancels Order

```
POST /api/orders/:id/rider-cancel
Role required: rider (assigned rider only)
```

**Purpose**: Rider backs out of an accepted order before picking up the item. This endpoint contains the re-broadcast logic — it either returns the order to `searching` for another rider to claim, or marks it `failed` if the search attempt limit is reached.

**URL Parameters**

| Param | Type | Notes |
|---|---|---|
| `id` | uuid | Order ID |

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | No | Rider's explanation (e.g., "vehicle broke down") |

**Cancellation allowed in these states only**

| Status | Allowed? |
|---|---|
| `accepted` | Yes |
| `en_route_pickup` | Yes |
| `arrived_pickup` | Yes |
| `picked_up` | **No** — item is with the rider; goes to `failed` instead |
| `in_transit` | **No** |

**Server-Side Logic — Re-broadcast Decision**

```
IF current search_attempts < 3:
    → Re-broadcast path (order returns to searching)
ELSE:
    → Fail path (order is permanently failed)
```

**Re-broadcast path (search_attempts < 3)**
1. UPDATE `orders`:
   - `status` = `searching`
   - `rider_id` = `NULL`
   - `search_attempts` = `search_attempts + 1`
   - `expires_at` = `now() + interval '2 minutes'` (fresh timeout window)
   - `accepted_at`, `en_route_at`, `arrived_pickup_at` reset to `NULL`
2. INSERT into `order_status_logs`:
   - `from_status` = previous status
   - `to_status` = `searching`
   - `actor_id` = rider id
   - `actor_role` = `rider`
   - `reason` = `rider_cancelled`

Realtime fires automatically: the UPDATE changes `status` back to `searching` → all online riders subscribed to `orders:broadcast` receive the order again. Re-broadcast is free — no extra logic needed.

**Fail path (search_attempts >= 3)**
1. UPDATE `orders`:
   - `status` = `failed`
   - `failure_reason` = `no_rider`
   - `failed_at` = `now()`
   - `rider_id` = `NULL`
2. INSERT into `order_status_logs`:
   - `from_status` = previous status
   - `to_status` = `failed`
   - `actor_id` = rider id
   - `actor_role` = `rider`
   - `reason` = `max_attempts_reached`

Realtime fires: customer receives `failed` status → UI shows "No riders available."

**Success Response — 200**
```json
{
  "data": {
    "id": "uuid",
    "status": "searching",
    "search_attempts": 2,
    "rider_id": null,
    "expires_at": "2024-01-01T00:12:00Z"
  },
  "message": "Order returned to searching. Looking for another rider."
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not the assigned rider |
| 404 | `ORDER_NOT_FOUND` | No order with this ID |
| 422 | `CANCEL_NOT_ALLOWED` | Status is picked_up or in_transit — goes to failed, not cancel |

---

## GROUP 3 — GPS ENDPOINT

---

### 10. Submit Location Ping

```
POST /api/rider/location
Role required: rider
```

**Purpose**: Rider's mobile app pushes GPS coordinates to the server during active delivery. These INSERTs trigger the Supabase Realtime channel that the customer's map is subscribed to.

**Call frequency**
- States `en_route_pickup` → `in_transit`: every **5 seconds**
- State `accepted` (not yet moving): every **15 seconds**
- All other states: do not call — no subscriber is listening

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `lat` | number | Yes | Current latitude |
| `lng` | number | Yes | Current longitude |
| `heading` | number | No | Direction in degrees 0–360 |
| `order_id` | uuid | No | Associate ping with active order |

**Server-Side Logic**
1. Verify caller is `rider`
2. INSERT into `rider_locations`:
   - `rider_id` = caller id
   - `lat`, `lng`, `heading`, `order_id` from body
   - `recorded_at` = `now()`
3. Return 201 — no body needed

**Success Response — 201**
```json
{
  "message": "Location recorded."
}
```

**Error Responses**

| Code | Error | Reason |
|---|---|---|
| 400 | `MISSING_COORDINATES` | lat or lng absent |
| 403 | `FORBIDDEN` | Caller is not a rider |

**Realtime Trigger**
INSERT on `rider_locations` fires → customer subscribed to `rider_locations:{order_id}` receives the new coordinates → map marker moves. This is the entire real-time tracking mechanism — no websocket management, no polling, no extra infrastructure.

---

## GROUP 4 — SYSTEM ENDPOINT

---

### 11. Expire Timed-Out Orders

```
POST /api/system/expire-orders
Auth: service_role key only (not exposed to any client)
```

**Purpose**: Handles the "no rider accepts" edge case. Called on a schedule (every 60 seconds via Supabase Edge Function + pg_cron or a Vercel cron job). Finds all `searching` orders whose `expires_at` has passed and marks them `failed`.

**Request Body**: None.

**Auth Note**: This endpoint must be protected by the Supabase `service_role` key, not a user JWT. It must never be callable by a customer or rider. In Next.js, check for a secret header or use a Supabase Edge Function triggered by pg_cron directly.

**Server-Side Logic**
1. SELECT all orders WHERE `status = 'searching'` AND `expires_at < now()`
   - Uses `idx_orders_searching_expires` partial index — fast even at scale
2. For each expired order:
   - UPDATE `orders`:
     - `status` = `failed`
     - `failure_reason` = `no_rider`
     - `failed_at` = `now()`
   - INSERT into `order_status_logs`:
     - `from_status` = `searching`
     - `to_status` = `failed`
     - `actor_id` = `NULL`
     - `actor_role` = `system`
     - `reason` = `timeout`
3. Return count of expired orders

**Success Response — 200**
```json
{
  "data": {
    "expired_count": 3
  },
  "message": "3 order(s) expired and marked as failed."
}
```

**Realtime Trigger**
UPDATE on `orders` fires for each expired order → customers with active subscriptions receive `status = 'failed'` → UI shows "No riders available. Would you like to try again?"

---

## REALTIME BEHAVIOR SUMMARY

### Which endpoints trigger Realtime

Every write to `orders` or `rider_locations` fires Supabase Realtime automatically — no extra code needed. The table is in the publication; Supabase handles the broadcast.

| Endpoint | Table written | Realtime event | Who receives it |
|---|---|---|---|
| POST /api/orders | orders INSERT | New searching order | All online riders |
| POST /api/orders/:id/accept | orders UPDATE | Status → accepted | Customer (order channel) |
| POST /api/orders/:id/status | orders UPDATE | Status advances | Customer (order channel) |
| POST /api/orders/:id/cancel | orders UPDATE | Status → cancelled | Assigned rider (order channel) |
| POST /api/orders/:id/rider-cancel | orders UPDATE | Status → searching or failed | All riders (broadcast) + customer |
| POST /api/rider/location | rider_locations INSERT | New GPS ping | Customer (location channel) |
| POST /api/system/expire-orders | orders UPDATE | Status → failed | Customer (order channel) |

### Which flows rely on subscriptions only (no REST poll)

Once a client has subscribed to a Realtime channel, it receives all future updates without calling any endpoint.

| Subscriber | Channel | Filter | What they receive |
|---|---|---|---|
| **Rider** | `orders` | `status = eq.searching` | New orders appear; re-broadcast orders re-appear |
| **Customer** | `orders` | `id = eq.{order_id}` | Every status change on their order |
| **Customer** | `rider_locations` | `order_id = eq.{order_id}` | GPS ping every 5 seconds → map moves |

**Initial load + then subscribe** pattern (both customer and rider):
1. Call the REST endpoint once to get current state (GET /api/orders/:id or GET /api/orders/available)
2. Subscribe to the Realtime channel
3. From that point forward, all updates arrive via Realtime — no polling

---

## VALID STATE TRANSITION REFERENCE

Quick reference for implementation. Each endpoint must validate against this before writing.

| From | To | Endpoint | Actor |
|---|---|---|---|
| *(none)* | `searching` | POST /api/orders | customer |
| `searching` | `accepted` | POST /api/orders/:id/accept | rider |
| `searching` | `cancelled` | POST /api/orders/:id/cancel | customer |
| `searching` | `failed` | POST /api/system/expire-orders | system |
| `accepted` | `en_route_pickup` | POST /api/orders/:id/status | rider |
| `accepted` | `cancelled` | POST /api/orders/:id/cancel | customer |
| `accepted` | `searching` | POST /api/orders/:id/rider-cancel | rider (re-broadcast) |
| `en_route_pickup` | `arrived_pickup` | POST /api/orders/:id/status | rider |
| `en_route_pickup` | `cancelled` | POST /api/orders/:id/cancel | customer |
| `en_route_pickup` | `searching` | POST /api/orders/:id/rider-cancel | rider (re-broadcast) |
| `arrived_pickup` | `picked_up` | POST /api/orders/:id/status | rider |
| `arrived_pickup` | `cancelled` | POST /api/orders/:id/cancel | customer |
| `arrived_pickup` | `searching` | POST /api/orders/:id/rider-cancel | rider (re-broadcast) |
| `picked_up` | `in_transit` | POST /api/orders/:id/status | rider |
| `picked_up` | `failed` | *(operator intervention — future)* | system |
| `in_transit` | `delivered` | POST /api/orders/:id/status | rider |
| `in_transit` | `failed` | *(operator intervention — future)* | system |
| `failed` | `searching` | POST /api/orders *(new order)* | customer (retry) |

---

## NOTES FOR IMPLEMENTATION

1. **Retry on failure**: When a customer retries after `failed`, they create a **new order** via POST /api/orders. The failed order row is never reused or modified.

2. **Logging is mandatory**: Every state transition must write to `order_status_logs`. If the log INSERT fails, the whole operation should be rolled back. Use a Supabase transaction for the UPDATE + INSERT pair.

3. **search_attempts threshold**: The limit of 3 is enforced in endpoint 9 (rider cancel). This is the only place it is incremented. The timeout cron (endpoint 11) does not increment it — it just fails the order outright.

4. **Rider abandonment after pickup**: If a rider abandons after `picked_up` or `in_transit`, there is no self-service path. The order is set to `failed` with `failure_reason = rider_abandoned`. This requires an operator dashboard action (post-MVP). For MVP, a manual Supabase update can handle the rare case.

5. **Delay flag**: Setting `is_delayed = true` on an order does not require a new endpoint. It can be added to the POST /api/orders/:id/status endpoint as an optional body field, or handled as a separate PATCH /api/orders/:id/delay endpoint post-MVP.
