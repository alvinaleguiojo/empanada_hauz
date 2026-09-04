"use client";

import { useRouter } from "next/navigation";
import { RiderNavigation } from "@/components/rider/rider-navigation";

type Job = Parameters<typeof RiderNavigation>[0]["initialJob"];

export function RiderMapShell({ job }: { job: Job }) {
  const router = useRouter();

  return (
    <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 pb-6 pt-6 text-[#241C18] sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-4 flex items-center justify-between gap-4 px-1">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8A817A]">Empanada Hauz</p>
            <h1 className="mt-1 text-2xl font-black">Delivery Map</h1>
          </div>
          <button
            type="button"
            onClick={() => router.replace("/rider")}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-[#241C18] shadow-[0_8px_20px_rgba(59,29,15,0.08)] ring-1 ring-[#F0E4D6]"
          >
            Dashboard
          </button>
        </div>

        <section className="relative h-[min(760px,calc(100dvh-132px))] min-h-[560px] overflow-hidden rounded-[30px] bg-white shadow-[0_18px_45px_rgba(59,29,15,0.12)] ring-1 ring-[#F0E4D6]">
          <RiderNavigation initialJob={job} onBack={() => router.replace("/rider")} />
        </section>
      </div>
    </main>
  );
}
