import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const supabase = createServiceClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("status");

  const counts = {
    total: 0,
    searching: 0,
    active: 0,
    delivered: 0,
    cancelled: 0,
    failed: 0,
  };

  const ACTIVE = ["accepted", "en_route_pickup", "arrived_pickup", "picked_up", "in_transit"];

  for (const order of orders ?? []) {
    counts.total++;
    if (order.status === "searching") counts.searching++;
    else if (ACTIVE.includes(order.status)) counts.active++;
    else if (order.status === "delivered") counts.delivered++;
    else if (order.status === "cancelled") counts.cancelled++;
    else if (order.status === "failed") counts.failed++;
  }

  return NextResponse.json({ data: counts });
}
