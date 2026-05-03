import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

// Valid rider-driven transitions and the timestamp field to set for each
const TRANSITIONS: Record<string, { to: string; timestampField: string }> = {
  accepted:         { to: "en_route_pickup",  timestampField: "en_route_at" },
  en_route_pickup:  { to: "arrived_pickup",   timestampField: "arrived_pickup_at" },
  arrived_pickup:   { to: "picked_up",        timestampField: "picked_up_at" },
  picked_up:        { to: "in_transit",       timestampField: "in_transit_at" },
  in_transit:       { to: "delivered",        timestampField: "delivered_at" },
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id;
  console.log(`[POST /api/orders/${orderId}/status] Request received`);

  // 1. Verify JWT and get caller identity
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn(`[POST /api/orders/${orderId}/status] Unauthenticated request`);
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
    console.error(`[POST /api/orders/${orderId}/status] Profile fetch error:`, profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "rider") {
    console.warn(`[POST /api/orders/${orderId}/status] Non-rider role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only riders can update delivery status." },
      { status: 403 }
    );
  }

  // 3. Fetch the current order — must belong to this rider
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, rider_id")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    console.warn(`[POST /api/orders/${orderId}/status] Order not found`);
    return NextResponse.json(
      { error: "ORDER_NOT_FOUND", message: "Order does not exist." },
      { status: 404 }
    );
  }

  if (order.rider_id !== user.id) {
    console.warn(`[POST /api/orders/${orderId}/status] Rider ${user.id} does not own this order`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "You are not the assigned rider for this order." },
      { status: 403 }
    );
  }

  // 4. Validate the transition
  const transition = TRANSITIONS[order.status];

  if (!transition) {
    console.warn(`[POST /api/orders/${orderId}/status] No valid transition from status: ${order.status}`);
    return NextResponse.json(
      {
        error: "INVALID_TRANSITION",
        message: `Order cannot be advanced from status: ${order.status}.`,
      },
      { status: 409 }
    );
  }

  const { to: newStatus, timestampField } = transition;

  // 5. Atomic UPDATE — guards against stale reads with status check in WHERE
  console.log(`[POST /api/orders/${orderId}/status] Transitioning ${order.status} → ${newStatus}`);

  const { data: updatedOrders, error: updateError } = await supabase
    .from("orders")
    .update({
      status: newStatus,
      [timestampField]: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", order.status)
    .eq("rider_id", user.id)
    .select("id, status, rider_id, customer_id, service_type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, notes, accepted_at, en_route_at, arrived_pickup_at, picked_up_at, in_transit_at, delivered_at");

  if (updateError) {
    console.error(`[POST /api/orders/${orderId}/status] Update error:`, updateError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to update order status." },
      { status: 500 }
    );
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    console.warn(`[POST /api/orders/${orderId}/status] Update returned 0 rows — concurrent modification`);
    return NextResponse.json(
      { error: "CONFLICT", message: "Order status changed by another process. Please refresh." },
      { status: 409 }
    );
  }

  // 6. Write status log
  const { error: logError } = await supabase.from("order_status_logs").insert({
    order_id: orderId,
    from_status: order.status,
    to_status: newStatus,
    actor_id: user.id,
    actor_role: "rider",
    reason: "rider_status_update",
  });

  if (logError) {
    console.error(`[POST /api/orders/${orderId}/status] Status log insert error:`, logError);
  }

  console.log(`[POST /api/orders/${orderId}/status] Updated to ${newStatus} by rider ${user.id}`);

  return NextResponse.json(
    {
      data: updatedOrders[0],
      message: `Order status updated to ${newStatus}.`,
    },
    { status: 200 }
  );
}
