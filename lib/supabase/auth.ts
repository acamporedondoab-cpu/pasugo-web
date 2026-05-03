import { NextRequest } from "next/server";
import { createClient as createBrowserClient } from "@supabase/supabase-js";
import { createClient } from "./server";

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (token) {
    // Bearer token auth (API / mobile) — inject token into all query headers
    // so RLS policies see auth.uid() correctly on every query.
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    return { supabase, user, error };
  }

  // Cookie-based auth (browser / Next.js SSR)
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user, error };
}
