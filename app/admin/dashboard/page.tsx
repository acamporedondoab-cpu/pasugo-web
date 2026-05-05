"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Period, PERIOD_OPTIONS, getPeriodFrom } from "@/lib/dateFilters";

type Stats = {
  total: number;
  searching: number;
  active: number;
  delivered: number;
  cancelled: number;
  failed: number;
  revenue: number;
  riderPayout: number;
};

// searching & active are live — not date-filtered, so no prefix change needed
const STAT_CARDS = [
  { key: "total",       label: "Total Services",  color: "text-gray-800",   prefix: "",  live: false },
  { key: "searching",   label: "Searching",        color: "text-yellow-600", prefix: "",  live: true  },
  { key: "active",      label: "Active Deliveries", color: "text-blue-600",   prefix: "",  live: true  },
  { key: "delivered",   label: "Delivered",        color: "text-green-600",  prefix: "",  live: false },
  { key: "cancelled",   label: "Cancelled",        color: "text-red-500",    prefix: "",  live: false },
  { key: "failed",      label: "Failed",           color: "text-gray-400",   prefix: "",  live: false },
  { key: "revenue",     label: "Total Revenue",    color: "text-orange-600", prefix: "₱", live: false },
  { key: "riderPayout", label: "Rider Payout",     color: "text-purple-600", prefix: "₱", live: false },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [period, setPeriod]   = useState<Period>("today");
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [period]);

  // Realtime: re-fetch on any order change (live cards stay current)
  useEffect(() => {
    const channel = supabase
      .channel("admin-orders-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchStats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchStats() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const from = getPeriodFrom(period);
    const url  = from ? `/api/admin/stats?from=${encodeURIComponent(from)}` : "/api/admin/stats";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setStats(json.data);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Live overview of all services</p>
        </div>

        {/* Period filter */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setLoading(true); setPeriod(opt.value); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading stats...</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STAT_CARDS.map(({ key, label, color, prefix, live }) => (
            <div key={key} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-400">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>
                {prefix}{stats[key].toLocaleString()}
              </p>
              {live && (
                <p className="text-xs text-gray-300 mt-1">live</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-red-500">Failed to load stats.</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.push("/admin/orders?status=searching")}
          className="text-sm bg-yellow-50 text-yellow-700 border border-yellow-200 px-4 py-2 rounded-lg hover:bg-yellow-100"
        >
          View Searching Services
        </button>
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm bg-orange-50 text-orange-600 border border-orange-200 px-4 py-2 rounded-lg hover:bg-orange-100"
        >
          All Services
        </button>
      </div>
    </div>
  );
}
