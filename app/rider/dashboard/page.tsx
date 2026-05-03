"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: string;
  service_type: string;
  pickup_address: string;
  dropoff_address: string;
  notes: string | null;
  expires_at: string;
  created_at: string;
};

export default function RiderDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAvailable();
    const channel = subscribeToOrders();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAvailable() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/orders/available", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setOrders(json.data ?? []);
    }
    setLoading(false);
  }

  function subscribeToOrders() {
    const channel = supabase
      .channel("rider-available-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          // Refresh the list on any order change
          fetchAvailable();
        }
      )
      .subscribe();

    return channel;
  }

  async function handleAccept(orderId: string) {
    setError("");
    setAccepting(orderId);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/orders/${orderId}/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.message ?? "Could not accept order.");
      setAccepting(null);
      return;
    }

    router.push(`/rider/orders/${orderId}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Available Orders</h2>
        <button
          onClick={fetchAvailable}
          className="text-xs text-orange-500 hover:underline"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">No orders available right now.</p>
          <p className="text-xs text-gray-300 mt-1">New orders will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold capitalize text-gray-800">
                  {order.service_type}
                </span>
                <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                  Searching
                </span>
              </div>
              <div className="space-y-0.5 text-sm text-gray-600 mb-3">
                <p><span className="text-gray-400">From:</span> {order.pickup_address}</p>
                <p><span className="text-gray-400">To:</span> {order.dropoff_address}</p>
                {order.notes && <p><span className="text-gray-400">Notes:</span> {order.notes}</p>}
              </div>
              <button
                onClick={() => handleAccept(order.id)}
                disabled={accepting === order.id}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm"
              >
                {accepting === order.id ? "Accepting..." : "Accept Order"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
