"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SERVICE_TYPES = ["pabili", "pahatid", "pasundo"] as const;

const STATUS_LABELS: Record<string, string> = {
  searching: "Looking for a rider",
  accepted: "Rider accepted",
  en_route_pickup: "Rider on the way",
  arrived_pickup: "Rider arrived",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
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

type Order = {
  id: string;
  service_type: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
};

export default function CustomerDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Form state
  const [serviceType, setServiceType] = useState<typeof SERVICE_TYPES[number]>("pahatid");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [notes, setNotes] = useState("");
  const [fareAmount, setFareAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("orders")
      .select("id, service_type, status, pickup_address, dropoff_address, created_at")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    setOrders(data ?? []);
    setLoadingOrders(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setFormError("Not logged in.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        service_type: serviceType,
        pickup_address: pickupAddress,
        pickup_lat: parseFloat(pickupLat),
        pickup_lng: parseFloat(pickupLng),
        dropoff_address: dropoffAddress,
        dropoff_lat: parseFloat(dropoffLat),
        dropoff_lng: parseFloat(dropoffLng),
        notes: notes || undefined,
        fare_amount: fareAmount ? parseInt(fareAmount, 10) : undefined,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setFormError(json.message ?? "Failed to create order.");
      setSubmitting(false);
      return;
    }

    router.push(`/customer/orders/${json.data.id}`);
  }

  return (
    <div className="space-y-8">
      {/* Create Order Form */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New Delivery Request</h2>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">

          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
            <div className="flex gap-2">
              {SERVICE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setServiceType(type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize ${
                    serviceType === type
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-600 border-gray-300 hover:border-orange-400"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Pickup */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Address</label>
            <input
              type="text"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              required
              placeholder="e.g. SM Mall, Cebu City"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Lat</label>
              <input
                type="number"
                step="any"
                value={pickupLat}
                onChange={(e) => setPickupLat(e.target.value)}
                required
                placeholder="10.3157"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Lng</label>
              <input
                type="number"
                step="any"
                value={pickupLng}
                onChange={(e) => setPickupLng(e.target.value)}
                required
                placeholder="123.8854"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Dropoff */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dropoff Address</label>
            <input
              type="text"
              value={dropoffAddress}
              onChange={(e) => setDropoffAddress(e.target.value)}
              required
              placeholder="e.g. Ayala Center, Cebu City"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dropoff Lat</label>
              <input
                type="number"
                step="any"
                value={dropoffLat}
                onChange={(e) => setDropoffLat(e.target.value)}
                required
                placeholder="10.3181"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dropoff Lng</label>
              <input
                type="number"
                step="any"
                value={dropoffLng}
                onChange={(e) => setDropoffLng(e.target.value)}
                required
                placeholder="123.9050"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Fare */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agreed Fare ₱ (optional)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={fareAmount}
              onChange={(e) => setFareAmount(e.target.value)}
              placeholder="e.g. 80"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any special instructions..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm"
          >
            {submitting ? "Requesting..." : "Request Delivery"}
          </button>
        </form>
      </section>

      {/* Recent Orders */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h2>
        {loadingOrders ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => router.push(`/customer/orders/${order.id}`)}
                className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-orange-300"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium capitalize text-gray-800">
                    {order.service_type}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{order.pickup_address} → {order.dropoff_address}</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
