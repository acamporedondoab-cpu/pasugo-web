import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const orderId = params.id;
  console.log(`[GET /api/orders/${orderId}] Request received`);

  // 1. Verify JWT
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn(`[GET /api/orders/${orderId}] Unauthenticated request`);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "You must be logged in." },
      { status: 401 }
    );
  }

  // 2. Fetch order — RLS ensures only customer or assigned rider can read it
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, service_type, customer_id, rider_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, notes, expires_at, created_at, accepted_at, en_route_at, arrived_pickup_at, picked_up_at, in_transit_at, delivered_at, cancelled_at, failed_at, search_attempts, cancelled_by, failure_reason")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.warn(`[GET /api/orders/${orderId}] Not found or access denied for user ${user.id}`);
    return NextResponse.json(
      { error: "ORDER_NOT_FOUND", message: "Order not found." },
      { status: 404 }
    );
  }

  // 3. Fetch status logs for this order
  const { data: logs, error: logsError } = await supabase
    .from("order_status_logs")
    .select("id, from_status, to_status, actor_id, actor_role, reason, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (logsError) {
    console.error(`[GET /api/orders/${orderId}] Logs fetch error:`, logsError);
  }

  console.log(`[GET /api/orders/${orderId}] Returned order with ${logs?.length ?? 0} log entries`);

  return NextResponse.json(
    { data: { ...order, logs: logs ?? [] } },
    { status: 200 }
  );
}
