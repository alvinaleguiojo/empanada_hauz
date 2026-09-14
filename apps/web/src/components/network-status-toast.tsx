"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

type NetworkState = "online" | "offline" | "restored";

export function NetworkStatusToast() {
  const [networkState, setNetworkState] = useState<NetworkState>("online");

  useEffect(() => {
    const syncNetworkState = () => {
      setNetworkState(navigator.onLine ? "online" : "offline");
    };

    const handleOnline = () => {
      setNetworkState("restored");
      window.setTimeout(() => {
        if (navigator.onLine) {
          setNetworkState("online");
        }
      }, 3200);
    };

    const handleOffline = () => {
      setNetworkState("offline");
    };

    syncNetworkState();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (networkState === "online") {
    return null;
  }

  const offline = networkState === "offline";
  const Icon = offline ? WifiOff : Wifi;

  return (
    <div
      role={offline ? "alert" : "status"}
      aria-live={offline ? "assertive" : "polite"}
      className="fixed inset-x-3 bottom-4 z-[12000] flex justify-center sm:inset-x-auto sm:right-6"
    >
      <div
        className={cn(
          "flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl transition",
          offline
            ? "border-amber-300/35 bg-[#2c2117]/95 text-amber-50"
            : "border-emerald-300/35 bg-[#13261f]/95 text-emerald-50"
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            offline ? "border-amber-200/25 bg-amber-300/12" : "border-emerald-200/25 bg-emerald-300/12"
          )}
        >
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{offline ? "No internet connection" : "Connection restored"}</p>
          <p className={cn("mt-0.5 text-xs leading-5", offline ? "text-amber-50/72" : "text-emerald-50/72")}>
            {offline ? "Some updates may pause until you are back online." : "Live updates are available again."}
          </p>
        </div>
      </div>
    </div>
  );
}
