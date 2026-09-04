"use client";

import { RiderNavigation } from "@/components/rider/rider-navigation";

type Job = Parameters<typeof RiderNavigation>[0]["initialJob"];

export function RiderMapShell({ job }: { job: Job }) {
  return (
    <main className="min-h-[100dvh] bg-[#FFF6EC] px-4 py-4 text-[#241C18] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-lg">
        <section className="relative h-[calc(100dvh-2rem)] min-h-[620px] w-full overflow-hidden rounded-[30px] bg-white shadow-[0_18px_45px_rgba(59,29,15,0.12)] ring-1 ring-[#F0E4D6]">
          <RiderNavigation initialJob={job} />
        </section>
      </div>
    </main>
  );
}
