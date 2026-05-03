import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build a response we can attach cookies to
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users to /auth/login
  const isProtected =
    pathname.startsWith("/customer") || pathname.startsWith("/rider") || pathname.startsWith("/admin");

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Restrict /admin to admin role only
  if (pathname.startsWith("/admin") && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  // Redirect authenticated users away from /auth/login
  if (pathname === "/auth/login" && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "admin") {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    } else if (profile?.role === "rider") {
      return NextResponse.redirect(new URL("/rider/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/customer/dashboard", request.url));
  }

  // Redirect root to login
  if (pathname === "/") {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "admin") {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    } else if (profile?.role === "rider") {
      return NextResponse.redirect(new URL("/rider/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/customer/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/", "/auth/login", "/customer/:path*", "/rider/:path*", "/admin/:path*"],
};
