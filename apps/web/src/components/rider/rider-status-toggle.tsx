"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Status = "offline" | "online" | "busy" | "suspended";

export function RiderStatusToggle({ initialStatus }: { initialStatus: Status }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOnline = status === "online" || status === "busy";
  const canToggle = status === "online" || status === "offline" || status === "busy";
  const nextStatus = status === "online" || status === "busy" ? "offline" : "online";

  async function toggle() {
    if (!canToggle || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<{ status: Status }>("/rider/status", {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      setStatus(updated.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change availability");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-[24px] border border-[#E9DED2] bg-[#FFF9F3] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8A817A]">Availability</p>
          <p className="mt-1 text-sm font-bold">{status === "online" ? "You are available for deliveries" : status === "busy" ? "You are on an active delivery" : status === "suspended" ? "Your account is suspended" : "You are offline"}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={!canToggle || busy}
          className={`relative h-11 w-[82px] shrink-0 rounded-full p-1 transition ${isOnline ? "bg-[#217A3B]" : "bg-[#C8BEB5]"} ${!canToggle ? "cursor-not-allowed opacity-70" : ""}`}
          aria-label={status === "online" || status === "busy" ? "Go offline" : "Go online"}
        >
          <span className={`block h-9 w-9 rounded-full bg-white shadow transition-transform ${isOnline ? "translate-x-[38px]" : "translate-x-0"}`} />
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
      <p className="mt-2 text-xs text-[#756D66]">{busy ? "Updating availability…" : status === "online" ? "Tap to go offline" : status === "busy" ? "Tap to go offline" : status === "offline" ? "Tap to go online and receive delivery assignments" : "Your account is suspended"}</p>
    </div>
  );
}
