import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabase/auth";

const VALID_SERVICE_TYPES = ["pabili", "pahatid", "pasundo"] as const;
type ServiceType = (typeof VALID_SERVICE_TYPES)[number];

export async function POST(request: NextRequest) {
  console.log("[POST /api/orders] Request received");

  // 1. Verify JWT and get caller identity (supports both cookie and Bearer token auth)
  const { supabase, user, error: authError } = await getUserFromRequest(request);

  if (authError || !user) {
    console.warn("[POST /api/orders] Unauthenticated request");
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "You must be logged in." },
      { status: 401 }
    );
  }

  // 2. Verify caller has role = 'customer'
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("[POST /api/orders] Profile fetch error:", profileError);
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "User profile not found." },
      { status: 401 }
    );
  }

  if (profile.role !== "customer") {
    console.warn(`[POST /api/orders] Non-customer role attempted: ${profile.role}`);
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only customers can create orders." },
      { status: 403 }
    );
  }

  // 3. Parse and validate request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const {
    service_type,
    pickup_address,
    pickup_lat,
    pickup_lng,
    dropoff_address,
    dropoff_lat,
    dropoff_lng,
    notes,
  } = body;

  // Required fields check
  if (
    !service_type ||
    !pickup_address ||
    pickup_lat == null ||
    pickup_lng == null ||
    !dropoff_address ||
    dropoff_lat == null ||
    dropoff_lng == null
  ) {
    return NextResponse.json(
      {
        error: "MISSING_FIELDS",
        message:
          "Required fields: service_type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng.",
      },
      { status: 400 }
    );
  }

  if (!VALID_SERVICE_TYPES.includes(service_type as ServiceType)) {
    return NextResponse.json(
      {
        error: "INVALID_SERVICE_TYPE",
        message: `service_type must be one of: ${VALID_SERVICE_TYPES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // 4. INSERT new order — expires_at defaults to now() + 2 minutes (set in DB)
  console.log(`[POST /api/orders] Creating order for customer ${user.id}`);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: user.id,
      service_type: service_type as ServiceType,
      status: "searching",
      pickup_address: pickup_address as string,
      pickup_lat: pickup_lat as number,
      pickup_lng: pickup_lng as number,
      dropoff_address: dropoff_address as string,
      dropoff_lat: dropoff_lat as number,
      dropoff_lng: dropoff_lng as number,
      notes: (notes as string | undefined) ?? null,
      search_attempts: 1,
    })
    .select(
      "id, status, service_type, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, notes, expires_at, created_at"
    )
    .single();

  if (orderError || !order) {
    console.error("[POST /api/orders] Order insert error:", orderError);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to create order." },
      { status: 500 }
    );
  }

  // 5. INSERT initial status log entry
  const { error: logError } = await supabase.from("order_status_logs").insert({
    order_id: order.id,
    from_status: null,
    to_status: "searching",
    actor_id: user.id,
    actor_role: "customer",
    reason: "order_created",
  });

  if (logError) {
    // Log the error but don't fail the request — the order was already created
    console.error("[POST /api/orders] Status log insert error:", logError);
  }

  console.log(`[POST /api/orders] Order created: ${order.id}`);

  return NextResponse.json({ data: order }, { status: 201 });
}
