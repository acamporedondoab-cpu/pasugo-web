import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

export async function GET(request: NextRequest) {
  console.log("[GET /api/orders/available] Request received");

  // 1. Verify JWT and get caller identity
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn("[GET /api/orders/available] Unauthenticated request");
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
    console.error("[GET /api/orders/available] Profile fetch error:", profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "rider") {
    console.warn(`[GET /api/orders/available] Non-rider role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only riders can view available orders." },
      { status: 403 }
    );
  }

  // 3. Fetch all searching orders that have not expired yet
  const { data: orders, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, service_type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, notes, expires_at, created_at"
    )
    .eq("status", "searching")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (fetchError) {
    console.error("[GET /api/orders/available] Fetch error:", fetchError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to fetch available orders." },
      { status: 500 }
    );
  }

  console.log(`[GET /api/orders/available] Returning ${orders?.length ?? 0} orders`);

  return NextResponse.json({ data: orders ?? [] }, { status: 200 });
}
