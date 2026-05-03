import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/supabase/auth";

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function requireAdmin(request: NextRequest) {
  const { user, supabase: userClient, error } = await getUserFromRequest(request);
  if (error || !user) return { admin: null, error: "Unauthorized" };

  const { data: profile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { admin: null, error: "Forbidden" };

  return { admin: user, error: null };
}
