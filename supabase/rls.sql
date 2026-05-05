-- =================================================================
-- PASUGO APP — ROW LEVEL SECURITY POLICIES
-- =================================================================
-- Run this after schema.sql.
-- Safe to re-run: each policy is guarded by an existence check.
-- =================================================================

DO $$
BEGIN

  -- ---------------------------------------------------------------
  -- profiles
  -- ---------------------------------------------------------------
  -- API routes read this table (via user JWT) to check role before
  -- processing any request.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);
  END IF;

  -- ---------------------------------------------------------------
  -- orders — SELECT
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Customers can read own orders'
  ) THEN
    CREATE POLICY "Customers can read own orders"
    ON public.orders FOR SELECT
    USING (auth.uid() = customer_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Riders can read searching and assigned orders'
  ) THEN
    CREATE POLICY "Riders can read searching and assigned orders"
    ON public.orders FOR SELECT
    USING (
      status = 'searching'
      OR auth.uid() = rider_id
    );
  END IF;

  -- ---------------------------------------------------------------
  -- orders — INSERT
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Customers can create orders'
  ) THEN
    CREATE POLICY "Customers can create orders"
    ON public.orders FOR INSERT
    WITH CHECK (auth.uid() = customer_id);
  END IF;

  -- ---------------------------------------------------------------
  -- orders — UPDATE
  -- Covers: customer cancel, rider accept, rider status advance,
  --         rider release (rider-cancel).
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Users can update relevant orders'
  ) THEN
    CREATE POLICY "Users can update relevant orders"
    ON public.orders FOR UPDATE
    USING (
      auth.uid() = customer_id
      OR auth.uid() = rider_id
      OR (status = 'searching' AND rider_id IS NULL)
    );
  END IF;

  -- ---------------------------------------------------------------
  -- order_status_logs — SELECT
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_status_logs' AND policyname = 'Users can read logs for their orders'
  ) THEN
    CREATE POLICY "Users can read logs for their orders"
    ON public.order_status_logs FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.orders
        WHERE orders.id = order_status_logs.order_id
          AND (orders.customer_id = auth.uid() OR orders.rider_id = auth.uid())
      )
    );
  END IF;

  -- ---------------------------------------------------------------
  -- order_status_logs — INSERT
  -- actor_id IS NULL covers system-triggered entries (expire cron
  -- uses service key and bypasses RLS, but this guards direct calls).
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_status_logs' AND policyname = 'Authenticated users can insert status logs'
  ) THEN
    CREATE POLICY "Authenticated users can insert status logs"
    ON public.order_status_logs FOR INSERT
    WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);
  END IF;

  -- ---------------------------------------------------------------
  -- rider_profiles
  -- ---------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rider_profiles' AND policyname = 'Riders can read own rider profile'
  ) THEN
    CREATE POLICY "Riders can read own rider profile"
    ON public.rider_profiles FOR SELECT
    USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rider_profiles' AND policyname = 'Riders can update own rider profile'
  ) THEN
    CREATE POLICY "Riders can update own rider profile"
    ON public.rider_profiles FOR UPDATE
    USING (auth.uid() = id);
  END IF;

END $$;
