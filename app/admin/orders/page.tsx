"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Period, PERIOD_OPTIONS, getPeriodFrom } from "@/lib/dateFilters";

type Order = {
  id: string;
  status: string;
  service_type: string;
  pickup_address: string;
  dropoff_address: string;
  fare_amount: number | null;
  cancelled_by: string | null;
  failure_reason: string | null;
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
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

const SERVICE_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "pabili",  label: "🛒 Pabili" },
  { value: "pahatid", label: "📦 Pahatid" },
  { value: "pasundo", label: "🙋 Pasundo" },
];

const STATUS_COLORS: Record<string, string> = {
  searching:      "bg-yellow-50 text-yellow-700",
  accepted:       "bg-blue-50 text-blue-700",
  en_route_pickup:"bg-blue-50 text-blue-700",
  arrived_pickup: "bg-blue-50 text-blue-700",
  in_transit:     "bg-purple-50 text-purple-700",
  delivered:      "bg-green-50 text-green-700",
  cancelled:      "bg-red-50 text-red-600",
  failed:         "bg-gray-100 text-gray-500",
};

const SERVICE_ICONS: Record<string, string> = {
  pabili: "🛒",
  pahatid: "📦",
  pasundo: "🙋",
};

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Loading...</p>}>
      <AdminOrders />
    </Suspense>
  );
}

function AdminOrders() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [period,      setPeriod]      = useState<Period>("today");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [typeFilter,  setTypeFilter]  = useState("");
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    fetchOrders();
  }, [period, statusFilter, typeFilter]);

  async function fetchOrders() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter)   params.set("service_type", typeFilter);

    const from = getPeriodFrom(period);
    if (from) params.set("from", from);

    const url = `/api/admin/orders${params.size > 0 ? `?${params.toString()}` : ""}`;

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

  function endReason(order: Order) {
    if (order.cancelled_by)   return `Cancelled by ${order.cancelled_by}`;
    if (order.failure_reason) return order.failure_reason.replace(/_/g, " ");
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Services</h1>
          <p className="text-sm text-gray-400 mt-1">Latest 100 services</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period filter */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
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
          <button onClick={fetchOrders} className="text-xs text-orange-500 hover:underline">
            Refresh
          </button>
        </div>
      </div>

      {/* Service type + status filters */}
      <div className="flex flex-wrap gap-4">
        {/* Service type */}
        <div className="flex flex-wrap gap-2">
          {SERVICE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                typeFilter === opt.value
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-200 self-stretch" />

        {/* Status */}
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === opt.value
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading services...</p>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No services found.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fare</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">End Reason</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => {
                const reason = endReason(order);
                return (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/admin/orders/${order.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">
                        {order.pickup_address} → {order.dropoff_address}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1">
                        <span>{SERVICE_ICONS[order.service_type] ?? "📦"}</span>
                        <span className="text-xs font-semibold text-gray-600 uppercase">{order.service_type}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {order.fare_amount != null ? `₱${order.fare_amount}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{order.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{order.rider?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 capitalize">
                      {reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(order.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
