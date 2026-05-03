"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  accepted: "Order Accepted",
  en_route_pickup: "En Route to Pickup",
  arrived_pickup: "Arrived at Pickup",
  picked_up: "Item Picked Up",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  accepted: "Head to Pickup",
  en_route_pickup: "Arrived at Pickup",
  arrived_pickup: "Picked Up",
  picked_up: "In Transit",
  in_transit: "Mark Delivered",
};

const RIDER_CANCELLABLE = ["accepted", "en_route_pickup", "arrived_pickup"];
const TERMINAL = ["delivered", "cancelled", "failed"];
const GPS_ACTIVE = ["accepted", "en_route_pickup", "arrived_pickup", "picked_up", "in_transit"];

type Order = {
  id: string;
  status: string;
  service_type: string;
  pickup_address: string;
  dropoff_address: string;
  notes: string | null;
};

export default function RiderActiveDelivery() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const supabase = createClient();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState("");
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchOrder();
    const channel = subscribeToOrder();
    return () => {
      supabase.removeChannel(channel);
      stopGps();
    };
  }, [orderId]);

  useEffect(() => {
    if (order && GPS_ACTIVE.includes(order.status)) {
      startGps();
    } else {
      stopGps();
    }
  }, [order?.status]);

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
    return supabase
      .channel(`rider-order-${orderId}`)
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
        }
      )
      .subscribe();
  }

  function startGps() {
    if (gpsIntervalRef.current) return;
    gpsIntervalRef.current = setInterval(sendLocationPing, 5000);
  }

  function stopGps() {
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
  }

  async function sendLocationPing() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch("/api/rider/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          order_id: orderId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
        }),
      });
    });
  }

  async function handleAdvance() {
    setActionError("");
    setAdvancing(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      setActionError(json.message ?? "Failed to update status.");
      setAdvancing(false);
      return;
    }

    setOrder((prev) => prev ? { ...prev, status: json.data.status } : prev);
    setAdvancing(false);

    if (json.data.status === "delivered") {
      setTimeout(() => router.push("/rider/dashboard"), 1500);
    }
  }

  async function handleRiderCancel() {
    setActionError("");
    setCancelling(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/orders/${orderId}/rider-cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      setActionError(json.message ?? "Failed to cancel.");
      setCancelling(false);
      return;
    }

    router.push("/rider/dashboard");
  }

  if (loading) return <p className="text-sm text-gray-400">Loading order...</p>;
  if (!order) return <p className="text-sm text-red-500">Order not found.</p>;

  const isTerminal = TERMINAL.includes(order.status);

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/rider/dashboard")}
        className="text-sm text-orange-500 hover:underline"
      >
        ← Back to dashboard
      </button>

      {/* Status Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize text-gray-500">{order.service_type}</span>
          <span className="text-sm font-semibold text-orange-600">
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        <div className="space-y-1 text-sm text-gray-700">
          <p><span className="text-gray-400">From:</span> {order.pickup_address}</p>
          <p><span className="text-gray-400">To:</span> {order.dropoff_address}</p>
          {order.notes && <p><span className="text-gray-400">Notes:</span> {order.notes}</p>}
        </div>

        {GPS_ACTIVE.includes(order.status) && (
          <p className="text-xs text-green-500">● GPS tracking active</p>
        )}

        {actionError && <p className="text-sm text-red-500">{actionError}</p>}

        {/* Advance button */}
        {NEXT_ACTION_LABELS[order.status] && (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 text-sm"
          >
            {advancing ? "Updating..." : NEXT_ACTION_LABELS[order.status]}
          </button>
        )}

        {/* Rider cancel button */}
        {RIDER_CANCELLABLE.includes(order.status) && (
          <button
            onClick={handleRiderCancel}
            disabled={cancelling}
            className="w-full border border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-50 rounded-lg py-2 text-sm font-medium"
          >
            {cancelling ? "Cancelling..." : "Release Order"}
          </button>
        )}

        {isTerminal && (
          <p className="text-center text-sm text-gray-400">
            This order is {order.status}.
          </p>
        )}
      </div>
    </div>
  );
}
