-- =================================================================
-- PASUGO APP — SUPABASE DATABASE SCHEMA
-- =================================================================
-- Paste this entire file into the Supabase SQL Editor and run it.
-- Execute once on a fresh database. Safe to re-run with IF NOT EXISTS
-- guards on extensions; all other objects will error if they already
-- exist — drop them first if you need to re-create.
--
-- Sections (run in order — dependencies respected):
--   1. Extensions
--   2. Enum types
--   3. Helper functions
--   4. profiles
--   5. rider_profiles
--   6. orders
--   7. order_status_logs
--   8. rider_locations
--   9. Realtime publication
-- =================================================================


-- =================================================================
-- SECTION 1: EXTENSIONS
-- =================================================================

-- pgcrypto provides gen_random_uuid() used in table defaults.
-- Already enabled on all Supabase projects; included for completeness.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =================================================================
-- SECTION 2: ENUM TYPES
-- =================================================================

-- Roles across all users
CREATE TYPE user_role AS ENUM (
  'customer',   -- places delivery orders
  'rider',      -- accepts and fulfills orders
  'operator',   -- monitors orders, resolves issues (no dispatch)
  'admin'       -- full platform management
);

-- Delivery service types
CREATE TYPE service_type AS ENUM (
  'pabili',     -- rider purchases items on customer's behalf
  'pahatid',    -- transport items from A to B
  'pasundo'     -- pick up person/item and bring to customer
);

-- Order state machine states (9 total)
CREATE TYPE order_status AS ENUM (
  'searching',        -- broadcast to riders, awaiting acceptance
  'accepted',         -- locked to one rider
  'en_route_pickup',  -- rider heading to pickup location
  'arrived_pickup',   -- rider is physically at the pickup location
  'picked_up',        -- item/person in rider's possession
  'in_transit',       -- rider heading to dropoff location
  'delivered',        -- completed successfully (terminal)
  'cancelled',        -- stopped before pickup (terminal)
  'failed'            -- timeout or abandonment (terminal)
);

-- Who triggered a cancellation
CREATE TYPE cancelled_by AS ENUM (
  'customer',   -- customer cancelled the order
  'system'      -- system cancelled (edge case auto-handling)
);

-- Why an order reached the failed state
CREATE TYPE failure_reason AS ENUM (
  'no_rider',        -- expired with no rider accepting
  'rider_abandoned'  -- rider disappeared after picking up item
);

-- Who triggered a status log entry
CREATE TYPE actor_role AS ENUM (
  'customer',
  'rider',
  'system'
);


-- =================================================================
-- SECTION 3: HELPER FUNCTIONS
-- =================================================================

-- Reusable trigger function: keeps updated_at current on any table.
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-creates a profiles row when a new Supabase auth user registers.
-- Name and phone are pulled from auth metadata set during sign-up.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, phone)
  VALUES (
    NEW.id,
    'customer',
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.phone, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =================================================================
-- SECTION 4: TABLE — profiles
-- =================================================================
-- Public user data, one row per registered user.
-- Extends auth.users via a shared id (uuid).

CREATE TABLE public.profiles (
  id              uuid         NOT NULL,
  role            user_role    NOT NULL  DEFAULT 'customer',
  name            text         NOT NULL  DEFAULT '',
  phone           text         NOT NULL  DEFAULT '',
  phone_verified  boolean      NOT NULL  DEFAULT false,
  avatar_url      text,
  created_at      timestamptz  NOT NULL  DEFAULT now(),
  updated_at      timestamptz  NOT NULL  DEFAULT now(),

  -- Primary key
  CONSTRAINT profiles_pkey
    PRIMARY KEY (id),

  -- Mirrors auth.users; cascade delete removes profile when auth user is deleted
  CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Phone numbers must be unique across all users
  CONSTRAINT profiles_phone_key
    UNIQUE (phone)
);

-- Admin and operator queries filter users by role
CREATE INDEX idx_profiles_role ON public.profiles (role);

-- Auto-update updated_at on every row change
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Create a profile row automatically when a new auth user is inserted
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- SECTION 5: TABLE — rider_profiles
-- =================================================================
-- Rider-specific fields only. 1:1 with profiles where role = 'rider'.
-- Kept separate so customer rows don't carry nullable rider columns.
-- Insert a row here when a user's role is set to 'rider'.

CREATE TABLE public.rider_profiles (
  id               uuid         NOT NULL,
  is_online        boolean      NOT NULL  DEFAULT false,
  vehicle_type     text         NOT NULL  DEFAULT 'motorcycle',
  plate_number     text,
  last_known_lat   float8,
  last_known_lng   float8,
  last_seen_at     timestamptz,
  created_at       timestamptz  NOT NULL  DEFAULT now(),

  -- Primary key; also enforces the 1:1 relationship
  CONSTRAINT rider_profiles_pkey
    PRIMARY KEY (id),

  -- Cascade delete: removing a profile removes the rider profile
  CONSTRAINT rider_profiles_id_fkey
    FOREIGN KEY (id) REFERENCES public.profiles (id) ON DELETE CASCADE
);

-- Broadcast eligibility check: filter riders where is_online = true
CREATE INDEX idx_rider_profiles_is_online ON public.rider_profiles (is_online);

ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- SECTION 6: TABLE — orders
-- =================================================================
-- Core table. All state machine fields live here.
-- Published to Supabase Realtime (see Section 9).

CREATE TABLE public.orders (
  id                 uuid            NOT NULL  DEFAULT gen_random_uuid(),
  customer_id        uuid            NOT NULL,
  rider_id           uuid,                     -- NULL until a rider accepts
  service_type       service_type    NOT NULL,
  status             order_status    NOT NULL  DEFAULT 'searching',

  -- Pickup location
  pickup_address     text            NOT NULL,
  pickup_lat         float8          NOT NULL,
  pickup_lng         float8          NOT NULL,

  -- Dropoff location
  dropoff_address    text            NOT NULL,
  dropoff_lat        float8          NOT NULL,
  dropoff_lng        float8          NOT NULL,

  -- Customer instructions
  notes              text,

  -- Re-broadcast tracking (max 3 before failing)
  search_attempts    int             NOT NULL  DEFAULT 1,

  -- Delay flag (does not change status — condition only)
  is_delayed         boolean         NOT NULL  DEFAULT false,
  delay_reason       text,

  -- Terminal state metadata
  cancelled_by       cancelled_by,             -- set when status = 'cancelled'
  failure_reason     failure_reason,           -- set when status = 'failed'

  -- Lifecycle timestamps (one per state)
  created_at         timestamptz     NOT NULL  DEFAULT now(),
  expires_at         timestamptz     NOT NULL  DEFAULT (now() + interval '2 minutes'),
  accepted_at        timestamptz,
  en_route_at        timestamptz,
  arrived_pickup_at  timestamptz,
  picked_up_at       timestamptz,
  in_transit_at      timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  failed_at          timestamptz,

  -- Primary key
  CONSTRAINT orders_pkey
    PRIMARY KEY (id),

  -- Foreign keys
  CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.profiles (id),

  CONSTRAINT orders_rider_id_fkey
    FOREIGN KEY (rider_id) REFERENCES public.profiles (id),

  -- A rider cannot accept their own order
  CONSTRAINT orders_no_self_delivery
    CHECK (customer_id != rider_id),

  -- search_attempts starts at 1 and only increments
  CONSTRAINT orders_search_attempts_positive
    CHECK (search_attempts >= 1),

  -- delay_reason is meaningless without the flag
  CONSTRAINT orders_delay_reason_requires_flag
    CHECK (delay_reason IS NULL OR is_delayed = true),

  -- Every failed order must record why it failed
  CONSTRAINT orders_failure_reason_when_failed
    CHECK (status != 'failed' OR failure_reason IS NOT NULL),

  -- Every cancelled order must record who cancelled it
  CONSTRAINT orders_cancelled_by_when_cancelled
    CHECK (status != 'cancelled' OR cancelled_by IS NOT NULL)
);

-- Riders query all orders with status = 'searching'
CREATE INDEX idx_orders_status
  ON public.orders (status);

-- Customer fetches their own order history
CREATE INDEX idx_orders_customer_id
  ON public.orders (customer_id);

-- Rider fetches their active and past orders
CREATE INDEX idx_orders_rider_id
  ON public.orders (rider_id);

-- Cron timeout job: only scans rows where status is still 'searching'
-- Partial index keeps this fast even with millions of completed orders
CREATE INDEX idx_orders_searching_expires
  ON public.orders (expires_at)
  WHERE status = 'searching';

-- Admin and analytics: time-ordered full scan
CREATE INDEX idx_orders_created_at
  ON public.orders (created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- SECTION 7: TABLE — order_status_logs
-- =================================================================
-- Append-only audit log. One row written per state transition.
-- Never updated or deleted — immutable by design and RLS.

CREATE TABLE public.order_status_logs (
  id           uuid         NOT NULL  DEFAULT gen_random_uuid(),
  order_id     uuid         NOT NULL,
  from_status  order_status,           -- NULL only on the initial creation log entry
  to_status    order_status NOT NULL,
  actor_id     uuid,                   -- NULL when the actor is the system (cron, auto)
  actor_role   actor_role   NOT NULL,
  reason       text,                   -- human-readable description of why
  created_at   timestamptz  NOT NULL  DEFAULT now(),

  -- Primary key
  CONSTRAINT order_status_logs_pkey
    PRIMARY KEY (id),

  -- Cascade: deleting an order removes its history
  CONSTRAINT order_status_logs_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders (id) ON DELETE CASCADE,

  -- Nullable FK: system-triggered transitions have no actor_id
  CONSTRAINT order_status_logs_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles (id)
);

-- Primary query: fetch the full transition history of one order
CREATE INDEX idx_status_logs_order_id
  ON public.order_status_logs (order_id);

-- Secondary: time-ordered log browsing in admin dashboard
CREATE INDEX idx_status_logs_created_at
  ON public.order_status_logs (created_at DESC);

ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- SECTION 8: TABLE — rider_locations
-- =================================================================
-- Append-only GPS ping history. One INSERT every 5–15 seconds
-- during active delivery. Never updated.
-- Published to Supabase Realtime (see Section 9).
-- Rows older than 24 hours are cleaned up by a scheduled cron job.

CREATE TABLE public.rider_locations (
  id           uuid        NOT NULL  DEFAULT gen_random_uuid(),
  rider_id     uuid        NOT NULL,
  order_id     uuid,                  -- NULL when rider is online but between orders
  lat          float8      NOT NULL,
  lng          float8      NOT NULL,
  heading      float4,                -- degrees 0–360; NULL if device doesn't provide it
  recorded_at  timestamptz NOT NULL  DEFAULT now(),

  -- Primary key
  CONSTRAINT rider_locations_pkey
    PRIMARY KEY (id),

  CONSTRAINT rider_locations_rider_id_fkey
    FOREIGN KEY (rider_id) REFERENCES public.profiles (id),

  -- Nullable: not every ping is tied to an order
  CONSTRAINT rider_locations_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders (id)
);

-- Customer's realtime subscription filters on order_id
CREATE INDEX idx_rider_loc_order_id
  ON public.rider_locations (order_id);

-- "Where is this rider right now?" — latest ping per rider
CREATE INDEX idx_rider_loc_rider_recorded
  ON public.rider_locations (rider_id, recorded_at DESC);

-- Cleanup cron deletes rows where recorded_at < NOW() - interval '24 hours'
CREATE INDEX idx_rider_loc_recorded_at
  ON public.rider_locations (recorded_at);

ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- SECTION 9: SUPABASE REALTIME PUBLICATION
-- =================================================================
-- Only orders and rider_locations need live push to clients.
--
-- orders        → riders see new 'searching' orders appear instantly
--               → customers track their order's status in real time
--
-- rider_locations → customers receive GPS pings every 5s during delivery
--
-- profiles, rider_profiles, order_status_logs are NOT published —
-- they are read on demand; no UI depends on live push for these.

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_locations;


-- =================================================================
-- END OF SCHEMA
-- =================================================================
-- Next step: RLS policies (separate file: supabase/rls.sql)
-- =================================================================
