import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const supabase = createServiceClient();

  let query = supabase
    .from("orders")
    .select(`
      id, status, service_type, pickup_address, dropoff_address, notes,
      created_at, delivered_at, cancelled_at, failed_at,
      customer:profiles!orders_customer_id_fkey(id, name, phone),
      rider:profiles!orders_rider_id_fkey(id, name, phone)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error("[admin/orders]", dbError);
    return NextResponse.json({ message: "Failed to fetch orders" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
