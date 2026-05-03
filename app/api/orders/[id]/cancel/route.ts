import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

// Customer can cancel up to and including arrived_pickup — after that the item is in the rider's hands
const CANCELLABLE_STATUSES = ["searching", "accepted", "en_route_pickup", "arrived_pickup"];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id;
  console.log(`[POST /api/orders/${orderId}/cancel] Request received`);

  // 1. Verify JWT
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn(`[POST /api/orders/${orderId}/cancel] Unauthenticated request`);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "You must be logged in." },
      { status: 401 }
    );
  }

  // 2. Verify caller has role = 'customer'
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error(`[POST /api/orders/${orderId}/cancel] Profile fetch error:`, profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "customer") {
    console.warn(`[POST /api/orders/${orderId}/cancel] Non-customer role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only customers can cancel orders." },
      { status: 403 }
    );
  }

  // 3. Fetch order — must belong to this customer
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, customer_id")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    console.warn(`[POST /api/orders/${orderId}/cancel] Order not found`);
    return NextResponse.json(
      { error: "ORDER_NOT_FOUND", message: "Order does not exist." },
      { status: 404 }
    );
  }

  if (order.customer_id !== user.id) {
    console.warn(`[POST /api/orders/${orderId}/cancel] Customer ${user.id} does not own this order`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "You can only cancel your own orders." },
      { status: 403 }
    );
  }

  // 4. Check if cancellation is allowed at this status
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    console.warn(`[POST /api/orders/${orderId}/cancel] Cannot cancel from status: ${order.status}`);
    return NextResponse.json(
      {
        error: "CANCEL_NOT_ALLOWED",
        message: `Order cannot be cancelled once it is ${order.status}. The item is already with the rider.`,
      },
      { status: 409 }
    );
  }

  // 5. Atomic UPDATE — status check in WHERE guards against concurrent state changes
  console.log(`[POST /api/orders/${orderId}/cancel] Cancelling order in status: ${order.status}`);

  const { data: cancelledOrders, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "customer",
    })
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .in("status", CANCELLABLE_STATUSES)
    .select("id, status, cancelled_at, cancelled_by");

  if (updateError) {
    console.error(`[POST /api/orders/${orderId}/cancel] Update error:`, updateError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to cancel order." },
      { status: 500 }
    );
  }

  if (!cancelledOrders || cancelledOrders.length === 0) {
    console.warn(`[POST /api/orders/${orderId}/cancel] Update returned 0 rows — status changed concurrently`);
    return NextResponse.json(
      { error: "CONFLICT", message: "Order status changed before cancel could complete. Please refresh." },
      { status: 409 }
    );
  }

  // 6. Write status log
  const { error: logError } = await supabase.from("order_status_logs").insert({
    order_id: orderId,
    from_status: order.status,
    to_status: "cancelled",
    actor_id: user.id,
    actor_role: "customer",
    reason: "customer_cancelled",
  });

  if (logError) {
    console.error(`[POST /api/orders/${orderId}/cancel] Status log insert error:`, logError);
  }

  console.log(`[POST /api/orders/${orderId}/cancel] Order cancelled by customer ${user.id}`);

  return NextResponse.json(
    {
      data: cancelledOrders[0],
      message: "Order cancelled successfully.",
    },
    { status: 200 }
  );
}
