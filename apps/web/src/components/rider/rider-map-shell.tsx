"use client";

import { useRouter } from "next/navigation";
import { RiderNavigation } from "@/components/rider/rider-navigation";

type Job = Parameters<typeof RiderNavigation>[0]["initialJob"];

export function RiderMapShell({ job }: { job: Job }) {
  const router = useRouter();

  return (
    <main className="min-h-[100dvh] bg-[#EDEBE8] md:flex md:items-center md:justify-center md:p-6">
      <div className="relative h-[100dvh] w-full overflow-hidden bg-[#FFF6EC] shadow-none md:h-[calc(100dvh-3rem)] md:w-full md:max-w-[430px] md:rounded-[28px] md:shadow-[0_24px_70px_rgba(59,29,15,0.18)] md:ring-1 md:ring-[#E0D7CF]">
        <RiderNavigation initialJob={job} onBack={() => router.replace("/rider")} />
      </div>
    </main>
  );
}
