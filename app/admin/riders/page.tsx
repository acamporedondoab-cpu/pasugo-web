"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type Period, PERIOD_OPTIONS, getPeriodFrom } from "@/lib/dateFilters";

type Rider = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  vehicle_model: string | null;
  plate_number: string | null;
  is_verified: boolean;
  photo_url: string | null;
  stats: {
    total: number;
    delivered: number;
    cancelled: number;
    earnings: number;
  };
};

const VEHICLE_TYPES = ["motorcycle", "car", "tricycle", "van", "bicycle"];

const INITIAL_FORM = {
  name: "",
  mobile_number: "",
  email: "",
  password: "",
  vehicle_model: "",
  vehicle_type: "motorcycle",
  plate_number: "",
};

export default function AdminRiders() {
  const supabase = createClient();

  const [period, setPeriod]   = useState<Period>("today");
  const [riders, setRiders]   = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  useEffect(() => {
    fetchRiders();
  }, [period]);

  async function fetchRiders() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const from = getPeriodFrom(period);
    const url  = from ? `/api/admin/riders?from=${encodeURIComponent(from)}` : "/api/admin/riders";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = await res.json();
      setRiders(json.data ?? []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreating(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/admin/riders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(form),
    });

    const json = await res.json();
    setCreating(false);

    if (!res.ok) {
      setCreateError(json.message ?? "Failed to create rider.");
      return;
    }

    const loginEmail = json.data.login_email;
    setCreateSuccess(`Rider created. Login email: ${loginEmail}`);
    setForm(INITIAL_FORM);
    fetchRiders();
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Riders</h1>
          <p className="text-sm text-gray-400 mt-1">All registered riders and their service stats</p>
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
          <button onClick={fetchRiders} className="text-xs text-orange-500 hover:underline">
            Refresh
          </button>
          <button
            onClick={() => { setShowCreate((v) => !v); setCreateError(""); setCreateSuccess(""); }}
            className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            {showCreate ? "Cancel" : "+ Create Rider"}
          </button>
        </div>
      </div>

      {/* Create Rider Form */}
      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">New Rider Account</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Juan dela Cruz"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Number *</label>
              <input
                type="text"
                required
                value={form.mobile_number}
                onChange={(e) => setForm((f) => ({ ...f, mobile_number: e.target.value }))}
                placeholder="09123456789"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email (login) <span className="text-gray-400">optional</span></label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Auto-generated if blank"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Vehicle Model */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Model *</label>
              <input
                type="text"
                required
                value={form.vehicle_model}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_model: e.target.value }))}
                placeholder="Honda Beat, Yamaha Mio..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Vehicle Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Type</label>
              <select
                value={form.vehicle_type}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </div>

            {/* Plate Number */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Plate Number *</label>
              <input
                type="text"
                required
                value={form.plate_number}
                onChange={(e) => setForm((f) => ({ ...f, plate_number: e.target.value.toUpperCase() }))}
                placeholder="ABC 1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Spacer + Submit */}
            <div className="col-span-2 flex items-center gap-3 pt-1">
              {createError && <p className="text-xs text-red-600 flex-1">{createError}</p>}
              {createSuccess && <p className="text-xs text-green-600 flex-1">{createSuccess}</p>}
              <button
                type="submit"
                disabled={creating}
                className="ml-auto bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
              >
                {creating ? "Creating..." : "Create Rider"}
              </button>
            </div>
          </form>
        </div>
      )}

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
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Plate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Total</th>
                <th className="px-4 py-3 text-center">Delivered</th>
                <th className="px-4 py-3 text-center">Cancelled</th>
                <th className="px-4 py-3 text-center">Success</th>
                <th className="px-4 py-3 text-right">Earnings</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {riders.map((rider) => (
                <tr key={rider.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {rider.photo_url ? (
                        <img
                          src={rider.photo_url}
                          alt={rider.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-orange-600">
                            {rider.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-800">{rider.name}</p>
                        <p className="text-xs text-gray-400">{rider.phone ?? "No phone"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{rider.vehicle_model ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono">{rider.plate_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    {rider.is_verified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        ✓ Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Unverified
                      </span>
                    )}
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
                  <td className="px-4 py-3 text-right font-semibold text-orange-600">
                    {rider.stats.earnings > 0 ? `₱${rider.stats.earnings.toLocaleString()}` : "—"}
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
