import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

const ACTIVE_DELIVERY_STATUSES = ["accepted", "en_route_pickup", "arrived_pickup", "picked_up", "in_transit"];

export async function POST(request: NextRequest) {
  console.log("[POST /api/rider/location] Request received");

  // 1. Verify JWT
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn("[POST /api/rider/location] Unauthenticated request");
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
    console.error("[POST /api/rider/location] Profile fetch error:", profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "rider") {
    console.warn(`[POST /api/rider/location] Non-rider role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only riders can submit location updates." },
      { status: 403 }
    );
  }

  // 3. Parse and validate request body
  let body: { order_id?: string; lat?: number; lng?: number; heading?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { order_id, lat, lng, heading } = body;

  if (!order_id || lat === undefined || lng === undefined) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "order_id, lat, and lng are required." },
      { status: 400 }
    );
  }

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "lat and lng must be numbers." },
      { status: 400 }
    );
  }

  // 4. Verify order is active and assigned to this rider
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, rider_id")
    .eq("id", order_id)
    .eq("rider_id", user.id)
    .single();

  if (orderError || !order) {
    console.warn(`[POST /api/rider/location] Order ${order_id} not found or not assigned to rider ${user.id}`);
    return NextResponse.json(
      { error: "ORDER_NOT_FOUND", message: "Active order not found." },
      { status: 404 }
    );
  }

  if (!ACTIVE_DELIVERY_STATUSES.includes(order.status)) {
    console.warn(`[POST /api/rider/location] Order ${order_id} is in non-active status: ${order.status}`);
    return NextResponse.json(
      { error: "ORDER_NOT_ACTIVE", message: "Location updates are only allowed during an active delivery." },
      { status: 409 }
    );
  }

  // 5. Insert location ping
  const insertPayload: Record<string, unknown> = {
    rider_id: user.id,
    order_id,
    lat,
    lng,
    recorded_at: new Date().toISOString(),
  };

  if (heading !== undefined && typeof heading === "number") {
    insertPayload.heading = heading;
  }

  const { data: location, error: insertError } = await supabase
    .from("rider_locations")
    .insert(insertPayload)
    .select("id, rider_id, order_id, lat, lng, heading, recorded_at")
    .single();

  if (insertError) {
    console.error("[POST /api/rider/location] Insert error:", insertError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to save location." },
      { status: 500 }
    );
  }

  console.log(`[POST /api/rider/location] Location saved for rider ${user.id}, order ${order_id}`);

  return NextResponse.json({ data: location }, { status: 201 });
}
