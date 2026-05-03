"use client";

import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Riders", href: "/admin/riders" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-bold text-orange-500 text-lg">
            Pasugo <span className="text-gray-400 font-normal text-sm">Admin</span>
          </span>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith(item.href)
                    ? "bg-orange-50 text-orange-600"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
