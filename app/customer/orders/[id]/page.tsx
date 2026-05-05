"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  searching: "Looking for a rider",
  accepted: "Rider accepted",
  en_route_pickup: "Rider on the way to pickup",
  arrived_pickup: "Rider arrived at pickup",
  in_transit: "In transit to dropoff",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed — no rider found",
};

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-yellow-100 text-yellow-700",
  accepted: "bg-blue-100 text-blue-700",
  en_route_pickup: "bg-blue-100 text-blue-700",
  arrived_pickup: "bg-blue-100 text-blue-700",
  in_transit: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  failed: "bg-red-100 text-red-600",
};

const CANCELLABLE_STATUSES = ["searching", "accepted", "en_route_pickup", "arrived_pickup"];

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
  created_at: string;
  logs: Log[];
};

export default function OrderTrackingPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const supabase = createClient();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    fetchOrder();
    const channel = subscribeToOrder();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  async function fetchOrder() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setOrder(json.data);
    }
    setLoading(false);
  }

  function subscribeToOrder() {
    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder((prev) => prev ? { ...prev, ...(payload.new as Partial<Order>) } : prev);
          // Refresh logs on status change
          fetchOrder();
        }
      )
      .subscribe();

    return channel;
  }

  async function handleCancel() {
    setCancelError("");
    setCancelling(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      setCancelError(json.message ?? "Failed to cancel.");
      setCancelling(false);
      return;
    }

    setOrder((prev) => prev ? { ...prev, status: json.data.status } : prev);
    setCancelling(false);
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading order...</p>;
  }

  if (!order) {
    return <p className="text-sm text-red-500">Order not found.</p>;
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/customer/dashboard")}
        className="text-sm text-orange-500 hover:underline"
      >
        ← Back to dashboard
      </button>

      {/* Status Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium capitalize text-gray-500">{order.service_type}</span>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-500"}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
        <div className="space-y-1 text-sm text-gray-700">
          <p><span className="text-gray-400">From:</span> {order.pickup_address}</p>
          <p><span className="text-gray-400">To:</span> {order.dropoff_address}</p>
          {order.notes && <p><span className="text-gray-400">Notes:</span> {order.notes}</p>}
        </div>

        {CANCELLABLE_STATUSES.includes(order.status) && (
          <div className="mt-4">
            {cancelError && <p className="text-xs text-red-500 mb-2">{cancelError}</p>}
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full border border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-50 rounded-lg py-2 text-sm font-medium"
            >
              {cancelling ? "Cancelling..." : "Cancel Order"}
            </button>
          </div>
        )}
      </div>

      {/* Status Log */}
      {order.logs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Timeline</h3>
          <div className="space-y-2">
            {order.logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700">
                    {STATUS_LABELS[log.to_status] ?? log.to_status}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
