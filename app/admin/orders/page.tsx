"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: string;
  status: string;
  service_type: string;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
  customer: { name: string; phone: string } | null;
  rider: { name: string; phone: string } | null;
};

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "searching", label: "Searching" },
  { value: "accepted", label: "Accepted" },
  { value: "en_route_pickup", label: "En Route" },
  { value: "arrived_pickup", label: "Arrived" },
  { value: "picked_up", label: "Picked Up" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-yellow-50 text-yellow-700",
  accepted: "bg-blue-50 text-blue-700",
  en_route_pickup: "bg-blue-50 text-blue-700",
  arrived_pickup: "bg-blue-50 text-blue-700",
  picked_up: "bg-purple-50 text-purple-700",
  in_transit: "bg-purple-50 text-purple-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-600",
  failed: "bg-gray-100 text-gray-500",
};

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Loading...</p>}>
      <AdminOrders />
    </Suspense>
  );
}

function AdminOrders() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  async function fetchOrders() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const url = statusFilter
      ? `/api/admin/orders?status=${statusFilter}`
      : "/api/admin/orders";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setOrders(json.data ?? []);
    }
    setLoading(false);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-PH", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-400 mt-1">Latest 100 orders</p>
        </div>
        <button onClick={fetchOrders} className="text-xs text-orange-500 hover:underline">
          Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === opt.value
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading orders...</p>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No orders found.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium capitalize text-gray-800">{order.service_type}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{order.pickup_address} → {order.dropoff_address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{order.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{order.rider?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
