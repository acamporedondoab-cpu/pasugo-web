import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

// Rider can cancel up to arrived_pickup — after picked_up the item is in their hands
const RIDER_CANCELLABLE_STATUSES = ["accepted", "en_route_pickup", "arrived_pickup"];

const MAX_SEARCH_ATTEMPTS = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id;
  console.log(`[POST /api/orders/${orderId}/rider-cancel] Request received`);

  // 1. Verify JWT
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn(`[POST /api/orders/${orderId}/rider-cancel] Unauthenticated request`);
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
    console.error(`[POST /api/orders/${orderId}/rider-cancel] Profile fetch error:`, profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "rider") {
    console.warn(`[POST /api/orders/${orderId}/rider-cancel] Non-rider role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only riders can use this endpoint." },
      { status: 403 }
    );
  }

  // 3. Fetch order — must be assigned to this rider
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, rider_id, search_attempts")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    console.warn(`[POST /api/orders/${orderId}/rider-cancel] Order not found`);
    return NextResponse.json(
      { error: "ORDER_NOT_FOUND", message: "Order does not exist." },
      { status: 404 }
    );
  }

  if (order.rider_id !== user.id) {
    console.warn(`[POST /api/orders/${orderId}/rider-cancel] Rider ${user.id} does not own this order`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "You are not the assigned rider for this order." },
      { status: 403 }
    );
  }

  // 4. Check if cancellation is allowed at this status
  if (!RIDER_CANCELLABLE_STATUSES.includes(order.status)) {
    console.warn(`[POST /api/orders/${orderId}/rider-cancel] Cannot cancel from status: ${order.status}`);
    return NextResponse.json(
      {
        error: "CANCEL_NOT_ALLOWED",
        message: `You cannot cancel once the order is ${order.status}. Contact support.`,
      },
      { status: 409 }
    );
  }

  // 5. Decide next state — if max attempts reached, fail the order instead of re-broadcasting
  const newAttempts = (order.search_attempts ?? 1) + 1;
  const rebroadcast = newAttempts <= MAX_SEARCH_ATTEMPTS;

  const newStatus = rebroadcast ? "searching" : "failed";
  const newExpiresAt = rebroadcast
    ? new Date(Date.now() + 2 * 60 * 1000).toISOString()
    : null;

  console.log(
    `[POST /api/orders/${orderId}/rider-cancel] Attempt ${newAttempts}/${MAX_SEARCH_ATTEMPTS} — transitioning to ${newStatus}`
  );

  // 6. Atomic UPDATE
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    rider_id: null,
    search_attempts: newAttempts,
    accepted_at: null,
    en_route_at: null,
    arrived_pickup_at: null,
  };

  if (rebroadcast) {
    updatePayload.expires_at = newExpiresAt;
  } else {
    updatePayload.failed_at = new Date().toISOString();
    updatePayload.failure_reason = "no_rider";
  }

  const { data: updatedOrders, error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("rider_id", user.id)
    .in("status", RIDER_CANCELLABLE_STATUSES)
    .select("id, status, rider_id, search_attempts, expires_at, failed_at, failure_reason");

  if (updateError) {
    console.error(`[POST /api/orders/${orderId}/rider-cancel] Update error:`, updateError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to cancel order." },
      { status: 500 }
    );
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    console.warn(`[POST /api/orders/${orderId}/rider-cancel] Update returned 0 rows`);
    return NextResponse.json(
      { error: "CONFLICT", message: "Order status changed before cancel could complete. Please refresh." },
      { status: 409 }
    );
  }

  // 7. Write status log
  const { error: logError } = await supabase.from("order_status_logs").insert({
    order_id: orderId,
    from_status: order.status,
    to_status: newStatus,
    actor_id: user.id,
    actor_role: "rider",
    reason: "rider_cancelled",
  });

  if (logError) {
    console.error(`[POST /api/orders/${orderId}/rider-cancel] Status log insert error:`, logError);
  }

  const message = rebroadcast
    ? "Order released. It will be broadcast to other riders."
    : "Order failed after maximum search attempts.";

  console.log(`[POST /api/orders/${orderId}/rider-cancel] ${message}`);

  return NextResponse.json({ data: updatedOrders[0], message }, { status: 200 });
}
