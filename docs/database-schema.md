# Pasugo App — Supabase Database Schema Design

**Status**: Design only. No SQL written yet.
**Based on**: Approved order state machine (locked).

---

## Overview

5 tables total. All sit in the Supabase `public` schema, extending `auth.users`.

| Table | Purpose |
|---|---|
| `profiles` | Public user data extending Supabase auth |
| `rider_profiles` | Rider-specific fields (1:1 with profiles where role = rider) |
| `orders` | Core order table — all state machine fields live here |
| `order_status_logs` | Append-only audit log of every state transition |
| `rider_locations` | Append-only GPS ping history during active delivery |

---

## Enums

Define all enum types first — referenced by table columns below.

### `user_role`
```
customer   — places delivery orders
rider      — accepts and fulfills orders
operator   — monitors orders, resolves issues (no dispatch)
admin      — full platform management
```

### `service_type`
```
pabili     — rider purchases items on customer's behalf
pahatid    — transport items from A to B
pasundo    — pick up person/item and bring to customer
```

### `order_status`
```
searching        — broadcast to riders, awaiting acceptance
accepted         — locked to one rider
en_route_pickup  — rider heading to pickup location
arrived_pickup   — rider is at the pickup location
picked_up        — item/person in rider's possession
in_transit       — rider heading to dropoff location
delivered        — completed successfully (terminal)
cancelled        — stopped before pickup (terminal)
failed           — timeout or abandonment (terminal)
```

### `cancelled_by`
```
customer   — customer cancelled the order
system     — system cancelled (e.g., auto-cancel on timeout edge cases)
```

### `failure_reason`
```
no_rider         — expired without any rider accepting
rider_abandoned  — rider disappeared after picking up
```

### `actor_role`  *(used in order_status_logs)*
```
customer
rider
system
```

---

## Table 1: `profiles`

Extends `auth.users`. One row per registered user of any role.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | — | PK; references `auth.users(id)` ON DELETE CASCADE |
| `role` | `user_role` | NO | `'customer'` | Enum defined above |
| `name` | `text` | NO | — | Full name |
| `phone` | `text` | NO | — | Must be unique; used for OTP login |
| `phone_verified` | `boolean` | NO | `false` | Set true after OTP confirmed |
| `avatar_url` | `text` | YES | `null` | Optional profile photo |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | Updated via trigger |

**Constraints:**
- `profiles_phone_key` — UNIQUE on `phone`
- `profiles_id_fkey` — FK to `auth.users(id)` ON DELETE CASCADE

**Indexes:**
- Primary key on `id`
- Unique index on `phone` (from constraint above)
- Index on `role` — for admin queries filtering by role

---

## Table 2: `rider_profiles`

Rider-only fields. One row per user where `role = 'rider'`. Kept separate to avoid nullable rider columns polluting every user row.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | — | PK; references `profiles(id)` ON DELETE CASCADE |
| `is_online` | `boolean` | NO | `false` | Controls broadcast eligibility |
| `vehicle_type` | `text` | NO | `'motorcycle'` | For future filtering |
| `plate_number` | `text` | YES | `null` | Optional for MVP |
| `last_known_lat` | `float8` | YES | `null` | Approximate last position (not realtime) |
| `last_known_lng` | `float8` | YES | `null` | Updated when rider goes offline |
| `last_seen_at` | `timestamptz` | YES | `null` | When the rider was last active |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints:**
- `rider_profiles_id_fkey` — FK to `profiles(id)` ON DELETE CASCADE
- `rider_profiles_id_key` — UNIQUE on `id` (enforces 1:1 with profiles)

**Indexes:**
- Primary key on `id`
- Index on `is_online` — riders are filtered by online status during broadcast

---

## Table 3: `orders`

The core table. Every field from the approved state machine lives here. This is the table Supabase Realtime publishes changes on.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `customer_id` | `uuid` | NO | — | FK → `profiles(id)` |
| `rider_id` | `uuid` | YES | `null` | FK → `profiles(id)`; null until accepted |
| `service_type` | `service_type` | NO | — | Enum |
| `status` | `order_status` | NO | `'searching'` | Enum; drives state machine |
| `pickup_address` | `text` | NO | — | Human-readable address string |
| `pickup_lat` | `float8` | NO | — | Latitude of pickup |
| `pickup_lng` | `float8` | NO | — | Longitude of pickup |
| `dropoff_address` | `text` | NO | — | Human-readable address string |
| `dropoff_lat` | `float8` | NO | — | Latitude of dropoff |
| `dropoff_lng` | `float8` | NO | — | Longitude of dropoff |
| `notes` | `text` | YES | `null` | Customer instructions (e.g., gate code) |
| `search_attempts` | `int` | NO | `1` | Increments on each re-broadcast |
| `is_delayed` | `boolean` | NO | `false` | Delay flag; does not change status |
| `delay_reason` | `text` | YES | `null` | Set when is_delayed = true |
| `cancelled_by` | `cancelled_by` | YES | `null` | Enum; set on cancellation |
| `failure_reason` | `failure_reason` | YES | `null` | Enum; set on failure |
| `created_at` | `timestamptz` | NO | `now()` | Order submitted |
| `expires_at` | `timestamptz` | NO | — | Timeout for searching; set on insert |
| `accepted_at` | `timestamptz` | YES | `null` | |
| `en_route_at` | `timestamptz` | YES | `null` | |
| `arrived_pickup_at` | `timestamptz` | YES | `null` | |
| `picked_up_at` | `timestamptz` | YES | `null` | |
| `in_transit_at` | `timestamptz` | YES | `null` | |
| `delivered_at` | `timestamptz` | YES | `null` | |
| `cancelled_at` | `timestamptz` | YES | `null` | |
| `failed_at` | `timestamptz` | YES | `null` | |

**Constraints:**

| Name | Rule | Purpose |
|---|---|---|
| `orders_customer_id_fkey` | FK → `profiles(id)` | Referential integrity |
| `orders_rider_id_fkey` | FK → `profiles(id)` | Referential integrity |
| `orders_no_self_delivery` | `CHECK (customer_id != rider_id)` | Prevent rider accepting own order |
| `orders_search_attempts_positive` | `CHECK (search_attempts >= 1)` | Must start at 1 |
| `orders_delay_reason_requires_flag` | `CHECK (delay_reason IS NULL OR is_delayed = true)` | Delay reason only valid when flagged |
| `orders_failure_reason_when_failed` | `CHECK (status != 'failed' OR failure_reason IS NOT NULL)` | Failed orders must have a reason |
| `orders_cancelled_by_when_cancelled` | `CHECK (status != 'cancelled' OR cancelled_by IS NOT NULL)` | Cancelled orders must have an actor |

**Indexes:**

| Index Name | Columns | Type | Notes |
|---|---|---|---|
| `idx_orders_status` | `status` | B-tree | Riders querying all searching orders |
| `idx_orders_customer_id` | `customer_id` | B-tree | Customer's order history |
| `idx_orders_rider_id` | `rider_id` | B-tree | Rider's active and past orders |
| `idx_orders_searching_expires` | `expires_at` WHERE `status = 'searching'` | Partial B-tree | Cron timeout check — only scans searching rows |
| `idx_orders_created_at` | `created_at DESC` | B-tree | Time-ordered queries (admin, analytics) |

**Why flat columns for location (not jsonb):**
- Lat/lng as `float8` columns are directly indexable and PostGIS-ready
- Simpler to query (`WHERE pickup_lat BETWEEN ...`)
- If Google Maps metadata (place_id, formatted_address) is needed later, a separate `jsonb` column can be added without changing existing columns

---

## Table 4: `order_status_logs`

Append-only audit log. Every state transition writes one row here — never updated or deleted.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `order_id` | `uuid` | NO | — | FK → `orders(id)` ON DELETE CASCADE |
| `from_status` | `order_status` | YES | `null` | null only for the initial insert row |
| `to_status` | `order_status` | NO | — | The state being entered |
| `actor_id` | `uuid` | YES | `null` | FK → `profiles(id)`; null when actor is system |
| `actor_role` | `actor_role` | NO | — | Enum: customer, rider, system |
| `reason` | `text` | YES | `null` | Human-readable reason string |
| `created_at` | `timestamptz` | NO | `now()` | Immutable — log time |

**Constraints:**
- `order_status_logs_order_id_fkey` — FK to `orders(id)` ON DELETE CASCADE
- `order_status_logs_actor_id_fkey` — FK to `profiles(id)` (nullable, no cascade)

**Indexes:**

| Index Name | Columns | Notes |
|---|---|---|
| `idx_status_logs_order_id` | `order_id` | Fetch full history of one order |
| `idx_status_logs_created_at` | `created_at DESC` | Time-ordered log queries |

**Note:** No UPDATE or DELETE RLS policies on this table — logs are immutable by design.

---

## Table 5: `rider_locations`

Append-only GPS ping history. Written every 5–15 seconds during active delivery. Never updated.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `rider_id` | `uuid` | NO | — | FK → `profiles(id)` |
| `order_id` | `uuid` | YES | `null` | FK → `orders(id)`; null when rider is online but not on delivery |
| `lat` | `float8` | NO | — | Current latitude |
| `lng` | `float8` | NO | — | Current longitude |
| `heading` | `float4` | YES | `null` | Degrees 0–360; used for map direction arrow |
| `recorded_at` | `timestamptz` | NO | `now()` | GPS capture time on device |

**Constraints:**
- `rider_locations_rider_id_fkey` — FK to `profiles(id)`
- `rider_locations_order_id_fkey` — FK to `orders(id)` (nullable, no cascade)

**Indexes:**

| Index Name | Columns | Notes |
|---|---|---|
| `idx_rider_loc_order_id` | `order_id` | Customer's realtime channel filters by order_id |
| `idx_rider_loc_rider_recorded` | `(rider_id, recorded_at DESC)` | Latest location per rider lookup |
| `idx_rider_loc_recorded_at` | `recorded_at` | Cleanup cron deletes rows older than 24h |

---

## Relationships Diagram

```
auth.users (Supabase built-in)
     │ 1:1
     ▼
  profiles ──────────────────────────────────────┐
     │ 1:1 (riders only)                         │
     ▼                                            │ FK: customer_id, rider_id
  rider_profiles                                  │
                                                  ▼
                                              orders
                                            /        \
                                  1:many              1:many
                                  /                        \
                      order_status_logs              rider_locations
                      (order_id FK)                  (order_id FK, rider_id FK)
```

---

## Realtime Configuration

These two tables must be added to Supabase's `supabase_realtime` publication:

| Table | Reason |
|---|---|
| `orders` | Riders subscribe to `searching` orders; customers track status of their order |
| `rider_locations` | Customers receive live GPS pings during active delivery |

Tables NOT in realtime publication (no realtime needed):
- `profiles` — no live UI depends on profile changes
- `rider_profiles` — `is_online` changes are infrequent; polled on demand
- `order_status_logs` — append-only audit; no live subscriber reads this

---

## Concurrency Safety Summary

The `orders` table is designed for the atomic conditional UPDATE pattern:

```
Condition checked atomically:
  WHERE id = :order_id
    AND status = 'searching'
    AND rider_id IS NULL
```

This relies on PostgreSQL's implicit row-level lock on the UPDATE target row. No additional lock columns, Redis, or queues needed. The `rider_id IS NULL` check is the guard — only one UPDATE can flip it from NULL to a value simultaneously.

This **must** be executed server-side (API route), not from the client directly.

---

## RLS Policy Intent (not SQL yet)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Own row (any); all rows (admin) | Own row only | Own row only | No |
| `rider_profiles` | Any (riders visible to customers for active order) | Own row only | Own row only | No |
| `orders` | Own order (customer); assigned order (rider); all (operator, admin) | Customer only | Via API route only (accept, status updates) | No |
| `order_status_logs` | Own orders (customer); assigned orders (rider); all (admin) | System/API only | No | No |
| `rider_locations` | Active order's rider (customer); own rows (rider) | Rider inserts own rows | No | No |

---

## Data Integrity Rules (summary)

1. An order in `accepted` or later states must have a non-null `rider_id`
2. An order in `failed` must have a non-null `failure_reason`
3. An order in `cancelled` must have a non-null `cancelled_by`
4. `delay_reason` may only be set when `is_delayed = true`
5. `customer_id` and `rider_id` must be different on the same order
6. `search_attempts` must always be ≥ 1
7. Status logs are insert-only — never updated or deleted
8. GPS rows are insert-only — never updated or deleted

---

## Cleanup Policy

| Table | Rule |
|---|---|
| `rider_locations` | Delete rows where `recorded_at < NOW() - interval '24 hours'` via scheduled cron |
| `order_status_logs` | Retain indefinitely (audit trail) |
| `orders` | Retain indefinitely (analytics, history) |
