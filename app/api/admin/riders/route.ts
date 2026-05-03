import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const supabase = createServiceClient();

  const { data: riders, error: ridersError } = await supabase
    .from("profiles")
    .select("id, name, phone, created_at")
    .eq("role", "rider")
    .order("created_at", { ascending: false });

  if (ridersError) {
    console.error("[admin/riders]", ridersError);
    return NextResponse.json({ message: "Failed to fetch riders" }, { status: 500 });
  }

  // Get delivery counts per rider
  const { data: orderStats } = await supabase
    .from("orders")
    .select("rider_id, status")
    .not("rider_id", "is", null);

  const statsMap: Record<string, { total: number; delivered: number; cancelled: number }> = {};

  for (const order of orderStats ?? []) {
    if (!statsMap[order.rider_id]) {
      statsMap[order.rider_id] = { total: 0, delivered: 0, cancelled: 0 };
    }
    statsMap[order.rider_id].total++;
    if (order.status === "delivered") statsMap[order.rider_id].delivered++;
    if (order.status === "cancelled" || order.status === "failed") statsMap[order.rider_id].cancelled++;
  }

  const data = (riders ?? []).map((rider) => ({
    ...rider,
    stats: statsMap[rider.id] ?? { total: 0, delivered: 0, cancelled: 0 },
  }));

  return NextResponse.json({ data });
}
