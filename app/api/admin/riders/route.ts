import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createServiceClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");

  const supabase = createServiceClient();

  const { data: riders, error: ridersError } = await supabase
    .from("profiles")
    .select("id, name, phone, created_at, rider_profiles(vehicle_model, vehicle_type, plate_number, is_verified, photo_url)")
    .eq("role", "rider")
    .order("created_at", { ascending: false });

  if (ridersError) {
    console.error("[admin/riders GET]", ridersError);
    return NextResponse.json({ message: "Failed to fetch riders" }, { status: 500 });
  }

  let orderQuery = supabase
    .from("orders")
    .select("rider_id, status, fare_amount")
    .not("rider_id", "is", null);

  if (from) orderQuery = orderQuery.gte("created_at", from);

  const { data: orderStats } = await orderQuery;

  const statsMap: Record<string, { total: number; delivered: number; cancelled: number; earnings: number }> = {};

  for (const order of orderStats ?? []) {
    if (!statsMap[order.rider_id]) {
      statsMap[order.rider_id] = { total: 0, delivered: 0, cancelled: 0, earnings: 0 };
    }
    statsMap[order.rider_id].total++;
    if (order.status === "delivered") {
      statsMap[order.rider_id].delivered++;
      statsMap[order.rider_id].earnings += order.fare_amount ?? 0;
    }
    if (order.status === "cancelled" || order.status === "failed") {
      statsMap[order.rider_id].cancelled++;
    }
  }

  const data = (riders ?? []).map((rider) => {
    const rp = Array.isArray(rider.rider_profiles) ? rider.rider_profiles[0] : rider.rider_profiles;
    return {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      created_at: rider.created_at,
      vehicle_model: (rp as { vehicle_model?: string | null })?.vehicle_model ?? null,
      plate_number: (rp as { plate_number?: string | null })?.plate_number ?? null,
      is_verified: (rp as { is_verified?: boolean })?.is_verified ?? false,
      photo_url: (rp as { photo_url?: string | null })?.photo_url ?? null,
      stats: statsMap[rider.id] ?? { total: 0, delivered: 0, cancelled: 0, earnings: 0 },
    };
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const { admin, error } = await requireAdmin(request);
  if (!admin) return NextResponse.json({ message: error }, { status: error === "Forbidden" ? 403 : 401 });

  const body = await request.json();
  const { name, mobile_number, email, password, vehicle_model, vehicle_type, plate_number } = body;

  if (!name || !mobile_number || !password || !vehicle_model || !plate_number) {
    return NextResponse.json({ message: "Missing required fields: name, mobile_number, password, vehicle_model, plate_number" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Use provided email or generate one from mobile number
  const loginEmail = email?.trim() || `${mobile_number.replace(/\D/g, "")}@pasugo.rider`;

  // Create auth user — trigger will create profile row using metadata
  const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
    email: loginEmail,
    password,
    user_metadata: {
      role: "rider",
      name,
      phone: mobile_number,
    },
    email_confirm: true,
  });

  if (createError || !user) {
    console.error("[admin/riders POST] createUser", createError);
    return NextResponse.json({ message: createError?.message ?? "Failed to create user" }, { status: 500 });
  }

  // Ensure profile has correct role/name/phone (in case trigger used old version without metadata support)
  await supabase
    .from("profiles")
    .update({ role: "rider", name, phone: mobile_number })
    .eq("id", user.id);

  // Insert rider_profiles
  const { error: riderProfileError } = await supabase
    .from("rider_profiles")
    .insert({
      id: user.id,
      vehicle_model,
      vehicle_type: vehicle_type || "motorcycle",
      plate_number,
      is_verified: true,
    });

  if (riderProfileError) {
    console.error("[admin/riders POST] rider_profiles insert", riderProfileError);
    await supabase.auth.admin.deleteUser(user.id);
    return NextResponse.json({ message: "Failed to create rider profile" }, { status: 500 });
  }

  console.log("[admin/riders POST] created rider", { id: user.id, name, email: loginEmail });
  return NextResponse.json({ data: { id: user.id, name, login_email: loginEmail } }, { status: 201 });
}
