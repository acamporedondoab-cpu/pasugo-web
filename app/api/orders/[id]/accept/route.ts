import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id;
  console.log(`[POST /api/orders/${orderId}/accept] Request received`);

  // 1. Verify JWT and get caller identity (supports both cookie and Bearer token auth)
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn(`[POST /api/orders/${orderId}/accept] Unauthenticated request`);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "You must be logged in." },
      { status: 401 }
    );
  }

  // 2. Verify caller has role = 'rider'
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error(`[POST /api/orders/${orderId}/accept] Profile fetch error:`, profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "rider") {
    console.warn(`[POST /api/orders/${orderId}/accept] Non-rider role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only riders can accept orders." },
      { status: 403 }
    );
  }

  // 3. Atomic conditional UPDATE — the core concurrency safety mechanism.
  //
  // The WHERE clause has two guards:
  //   - status = 'searching'  → order must still be open
  //   - rider_id IS NULL      → no one has accepted yet
  //
  // PostgreSQL locks the row during the UPDATE. Only one concurrent UPDATE
  // can win. Any other UPDATE that arrives at the same time will find
  // status != 'searching' or rider_id IS NOT NULL and return 0 rows.
  console.log(`[POST /api/orders/${orderId}/accept] Attempting atomic accept for rider ${user.id}`);

  const { data: acceptedOrders, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "accepted",
      rider_id: user.id,
      accepted_at: new Date().toISOString(),
      search_attempts: 0,
    })
    .eq("id", orderId)
    .eq("status", "searching")
    .is("rider_id", null)
    .select(
      "id, status, rider_id, accepted_at, customer_id, service_type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, notes"
    );

  if (updateError) {
    console.error(`[POST /api/orders/${orderId}/accept] Update error:`, updateError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to accept order." },
      { status: 500 }
    );
  }

  // 4. If 0 rows returned — this rider lost the race or order is unavailable
  if (!acceptedOrders || acceptedOrders.length === 0) {
    console.warn(`[POST /api/orders/${orderId}/accept] Rider ${user.id} lost the race or order unavailable`);

    // Check why the order could not be accepted to return a helpful error
    const { data: currentOrder } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (!currentOrder) {
      return NextResponse.json(
        { error: "ORDER_NOT_FOUND", message: "Order does not exist." },
        { status: 404 }
      );
    }

    if (currentOrder.status === "searching") {
      // Row existed in searching but rider_id was not NULL — edge case; extremely rare
      return NextResponse.json(
        { error: "ORDER_ALREADY_TAKEN", message: "This order was just taken by another rider." },
        { status: 409 }
      );
    }

    // Order is in any non-searching state (accepted, cancelled, failed, etc.)
    return NextResponse.json(
      {
        error: "ORDER_NOT_AVAILABLE",
        message: `Order is no longer available. Current status: ${currentOrder.status}.`,
      },
      { status: 409 }
    );
  }

  // 5. This rider won — write the status log
  const order = acceptedOrders[0];

  const { error: logError } = await supabase.from("order_status_logs").insert({
    order_id: order.id,
    from_status: "searching",
    to_status: "accepted",
    actor_id: user.id,
    actor_role: "rider",
    reason: "rider_accepted",
  });

  if (logError) {
    // Log the error but don't fail — the order is already locked to this rider
    console.error(`[POST /api/orders/${orderId}/accept] Status log insert error:`, logError);
  }

  console.log(`[POST /api/orders/${orderId}/accept] Rider ${user.id} accepted order successfully`);

  return NextResponse.json(
    {
      data: order,
      message: "Order accepted. Head to pickup location.",
    },
    { status: 200 }
  );
}
