import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  console.log("[POST /api/system/expire-orders] Cron triggered");

  // 1. Verify cron secret
  const authHeader = request.headers.get("Authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    console.warn("[POST /api/system/expire-orders] Unauthorized cron request");
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid cron secret." },
      { status: 401 }
    );
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // 2. Find all searching orders that have timed out
  const { data: expiredOrders, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("status", "searching")
    .lt("expires_at", now);

  if (fetchError) {
    console.error("[POST /api/system/expire-orders] Fetch error:", fetchError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to query expired orders." },
      { status: 500 }
    );
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    console.log("[POST /api/system/expire-orders] No expired orders found");
    return NextResponse.json({ data: { expired: 0 } }, { status: 200 });
  }

  const expiredIds = expiredOrders.map((o) => o.id);
  console.log(`[POST /api/system/expire-orders] Expiring ${expiredIds.length} orders:`, expiredIds);

  // 3. Bulk update all expired orders to failed
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "failed",
      failed_at: now,
      failure_reason: "no_rider",
    })
    .in("id", expiredIds)
    .eq("status", "searching");

  if (updateError) {
    console.error("[POST /api/system/expire-orders] Update error:", updateError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to expire orders." },
      { status: 500 }
    );
  }

  // 4. Insert status log for each expired order
  const logs = expiredOrders.map((order) => ({
    order_id: order.id,
    from_status: "searching",
    to_status: "failed",
    actor_id: null,
    actor_role: "system",
    reason: "timeout",
  }));

  const { error: logError } = await supabase.from("order_status_logs").insert(logs);

  if (logError) {
    console.error("[POST /api/system/expire-orders] Status log insert error:", logError);
  }

  console.log(`[POST /api/system/expire-orders] Expired ${expiredIds.length} orders`);

  return NextResponse.json({ data: { expired: expiredIds.length } }, { status: 200 });
}
