"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RiderNavigation } from "@/components/rider/rider-navigation";

type Job = Parameters<typeof RiderNavigation>[0]["initialJob"];

export function RiderMapShell({ job }: { job: Job }) {
  const router = useRouter();

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <RiderNavigation initialJob={job} onBack={() => router.replace("/rider")} />
    </div>
  );
}
