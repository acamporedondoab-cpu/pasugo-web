"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Rider = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  stats: {
    total: number;
    delivered: number;
    cancelled: number;
  };
};

export default function AdminRiders() {
  const supabase = createClient();

  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRiders();
  }, []);

  async function fetchRiders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/admin/riders", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setRiders(json.data ?? []);
    }
    setLoading(false);
  }

  function successRate(rider: Rider) {
    if (rider.stats.total === 0) return "—";
    return `${Math.round((rider.stats.delivered / rider.stats.total) * 100)}%`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Riders</h1>
          <p className="text-sm text-gray-400 mt-1">All registered riders and their delivery stats</p>
        </div>
        <button onClick={fetchRiders} className="text-xs text-orange-500 hover:underline">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading riders...</p>
      ) : riders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No riders registered yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3 text-center">Total Trips</th>
                <th className="px-4 py-3 text-center">Delivered</th>
                <th className="px-4 py-3 text-center">Cancelled/Failed</th>
                <th className="px-4 py-3 text-center">Success Rate</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {riders.map((rider) => (
                <tr key={rider.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{rider.name}</p>
                    <p className="text-xs text-gray-400">{rider.phone ?? "No phone"}</p>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{rider.stats.total}</td>
                  <td className="px-4 py-3 text-center text-green-600 font-medium">{rider.stats.delivered}</td>
                  <td className="px-4 py-3 text-center text-red-400">{rider.stats.cancelled}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-semibold ${
                      rider.stats.total === 0 ? "text-gray-300" :
                      rider.stats.delivered / rider.stats.total >= 0.8 ? "text-green-600" :
                      rider.stats.delivered / rider.stats.total >= 0.5 ? "text-yellow-600" : "text-red-500"
                    }`}>
                      {successRate(rider)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(rider.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
