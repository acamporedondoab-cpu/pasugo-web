"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  total: number;
  searching: number;
  active: number;
  delivered: number;
  cancelled: number;
  failed: number;
};

const STAT_CARDS = [
  { key: "total", label: "Total Orders", color: "text-gray-800" },
  { key: "searching", label: "Searching", color: "text-yellow-600" },
  { key: "active", label: "Active Now", color: "text-blue-600" },
  { key: "delivered", label: "Delivered", color: "text-green-600" },
  { key: "cancelled", label: "Cancelled", color: "text-red-500" },
  { key: "failed", label: "Failed", color: "text-gray-400" },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const channel = supabase
      .channel("admin-orders-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchStats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchStats() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setStats(json.data);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Live overview of all orders</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading stats...</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {STAT_CARDS.map(({ key, label, color }) => (
            <div key={key} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-sm text-gray-400">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${color}`}>{stats[key]}</p>
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
          View Searching Orders
        </button>
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm bg-orange-50 text-orange-600 border border-orange-200 px-4 py-2 rounded-lg hover:bg-orange-100"
        >
          All Orders
        </button>
      </div>
    </div>
  );
}
