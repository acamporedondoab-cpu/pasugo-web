import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

const ACTIVE_STATUSES = ["accepted", "en_route_pickup", "arrived_pickup", "picked_up", "in_transit"];

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from"); // ISO string or null

  const supabase = createServiceClient();

  // Live counts — always unfiltered (searching/active are current state, not history)
  const { data: liveOrders } = await supabase
    .from("orders")
    .select("status")
    .in("status", ["searching", ...ACTIVE_STATUSES]);

  let searching = 0;
  let active = 0;
  for (const o of liveOrders ?? []) {
    if (o.status === "searching") searching++;
    else active++;
  }

  // Historical counts — filtered by created_at when a period is selected
  let histQuery = supabase
    .from("orders")
    .select("status, fare_amount");

  if (from) histQuery = histQuery.gte("created_at", from);

  const { data: orders } = await histQuery;

  let total = 0, delivered = 0, cancelled = 0, failed = 0, revenue = 0, riderPayout = 0;

  for (const o of orders ?? []) {
    total++;
    if (o.status === "delivered") {
      delivered++;
      revenue += o.fare_amount ?? 0;
      riderPayout += o.fare_amount ?? 0;
    } else if (o.status === "cancelled") {
      cancelled++;
    } else if (o.status === "failed") {
      failed++;
    }
  }

  return NextResponse.json({
    data: { total, searching, active, delivered, cancelled, failed, revenue, riderPayout },
  });
}
