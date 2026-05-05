"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Log = {
  id: string;
  from_status: string;
  to_status: string;
  actor_role: string;
  reason: string | null;
  created_at: string;
};

type Order = {
  id: string;
  status: string;
  service_type: string;
  pickup_address: string;
  dropoff_address: string;
  notes: string | null;
  fare_amount: number | null;
  created_at: string;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  cancelled_by: string | null;
  failure_reason: string | null;
  search_attempts: number;
  customer: { name: string; phone: string } | null;
  rider: { name: string; phone: string } | null;
  logs: Log[];
};

const STATUS_COLORS: Record<string, string> = {
  delivered: "text-green-600",
  cancelled: "text-red-500",
  failed: "text-gray-400",
  searching: "text-yellow-600",
};

export default function AdminOrderDetail() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const supabase = createClient();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  async function fetchOrder() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/admin/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setOrder(json.data);
    }
    setLoading(false);
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }

  if (loading) return <p className="text-sm text-gray-400">Loading order...</p>;
  if (!order) return <p className="text-sm text-red-500">Order not found.</p>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/admin/orders")}
        className="text-sm text-orange-500 hover:underline"
      >
        ← Back to orders
      </button>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Order info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 capitalize">{order.service_type}</h2>
            <span className={`text-sm font-semibold ${STATUS_COLORS[order.status] ?? "text-blue-600"}`}>
              {order.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="space-y-1 text-sm text-gray-700">
            <p><span className="text-gray-400">From:</span> {order.pickup_address}</p>
            <p><span className="text-gray-400">To:</span> {order.dropoff_address}</p>
            {order.notes && <p><span className="text-gray-400">Notes:</span> {order.notes}</p>}
            <p><span className="text-gray-400">Fare:</span> {order.fare_amount != null ? `₱${order.fare_amount}` : "—"}</p>
          </div>
          <div className="text-xs text-gray-400 space-y-0.5 pt-2 border-t border-gray-100">
            <p>Created: {formatDate(order.created_at)}</p>
            {order.accepted_at && <p>Accepted: {formatDate(order.accepted_at)}</p>}
            {order.picked_up_at && <p>Picked up: {formatDate(order.picked_up_at)}</p>}
            {order.delivered_at && <p>Delivered: {formatDate(order.delivered_at)}</p>}
            {order.cancelled_at && <p>Cancelled: {formatDate(order.cancelled_at)} {order.cancelled_by ? `(by ${order.cancelled_by})` : ""}</p>}
            {order.failed_at && <p>Failed: {formatDate(order.failed_at)} {order.failure_reason ? `(${order.failure_reason})` : ""}</p>}
            <p>Search attempts: {order.search_attempts}</p>
          </div>
        </div>

        {/* People */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Customer</p>
            {order.customer ? (
              <div className="text-sm text-gray-800">
                <p className="font-medium">{order.customer.name}</p>
                <p className="text-gray-400">{order.customer.phone ?? "No phone"}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Rider</p>
            {order.rider ? (
              <div className="text-sm text-gray-800">
                <p className="font-medium">{order.rider.name}</p>
                <p className="text-gray-400">{order.rider.phone ?? "No phone"}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No rider assigned</p>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Timeline</h3>
        {order.logs.length === 0 ? (
          <p className="text-sm text-gray-400">No log entries.</p>
        ) : (
          <ol className="space-y-3">
            {order.logs.map((log) => (
              <li key={log.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                <div>
                  <p className="text-gray-700">
                    <span className="font-medium capitalize">{log.to_status.replace(/_/g, " ")}</span>
                    {log.reason && <span className="text-gray-400"> — {log.reason}</span>}
                    <span className="text-xs text-gray-300 ml-1">({log.actor_role})</span>
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(log.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
