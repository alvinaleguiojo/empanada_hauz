"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { RiderNavigation } from "@/components/rider/rider-navigation";

type Job = Parameters<typeof RiderNavigation>[0]["initialJob"];

export function RiderMapShell({ job }: { job: Job }) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(true);

  return (
    <div className={`relative h-[100dvh] w-full overflow-hidden ${drawerOpen ? "" : "[&>div>div:last-child]:translate-y-full"}`}>
      <RiderNavigation initialJob={job} onBack={() => router.replace("/rider")} />
      <button
        type="button"
        aria-label={drawerOpen ? "Hide delivery details" : "Show delivery details"}
        onClick={() => setDrawerOpen((open) => !open)}
        className="absolute bottom-5 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#111827] shadow-xl ring-1 ring-black/10 touch-manipulation"
      >
        {drawerOpen ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
      </button>
    </div>
  );
}
