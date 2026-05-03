import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const supabase = createServiceClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id, status, service_type, pickup_address, dropoff_address, notes,
      created_at, accepted_at, en_route_at, arrived_pickup_at,
      picked_up_at, in_transit_at, delivered_at, cancelled_at, failed_at,
      cancelled_by, failure_reason, search_attempts,
      customer:profiles!orders_customer_id_fkey(id, name, phone),
      rider:profiles!orders_rider_id_fkey(id, name, phone)
    `)
    .eq("id", params.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  const { data: logs } = await supabase
    .from("order_status_logs")
    .select("id, from_status, to_status, actor_role, reason, created_at")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ data: { ...order, logs: logs ?? [] } });
}
