import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const { searchParams } = new URL(request.url);
  const status      = searchParams.get("status");
  const serviceType = searchParams.get("service_type");
  const from        = searchParams.get("from"); // ISO string
  const to          = searchParams.get("to");   // ISO string

  const supabase = createServiceClient();

  let query = supabase
    .from("orders")
    .select(`
      id, status, service_type, pickup_address, dropoff_address, notes,
      fare_amount, cancelled_by, failure_reason,
      created_at, delivered_at, cancelled_at, failed_at,
      customer:profiles!orders_customer_id_fkey(id, name, phone),
      rider:profiles!orders_rider_id_fkey(id, name, phone)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status)      query = query.eq("status", status);
  if (serviceType) query = query.eq("service_type", serviceType);
  if (from)        query = query.gte("created_at", from);
  if (to)          query = query.lte("created_at", to);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error("[admin/orders]", dbError);
    return NextResponse.json({ message: "Failed to fetch orders" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
