"use client";

import { useRouter } from "next/navigation";
import { RiderNavigation } from "@/components/rider/rider-navigation";

type Job = Parameters<typeof RiderNavigation>[0]["initialJob"];

function money(value?: number | null) {
  return value == null ? "—" : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RiderMapShell({ job }: { job: Job }) {
  const router = useRouter();
  const codAmount = Number(job.codAmount ?? job.order?.codAmount ?? job.order?.amountDue ?? job.order?.totalAmount ?? 0);
  const deliveryFee = Number(job.finalFare ?? job.estimatedFare ?? job.deliveryFee ?? job.order?.deliveryFee ?? 0);
  const total = codAmount + deliveryFee;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <style>{`
        .web-rider-map-drawer-fix > div > div.absolute.bottom-0.left-0.right-0.z-30 > div:first-child .truncate {
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }
        .web-rider-map-drawer-fix > div > div.absolute.bottom-0.left-0.right-0.z-30::after {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-top: .625rem;
          padding-top: .625rem;
          border-top: 1px solid #e5e7eb;
          color: #111827;
          font-size: .8125rem;
          font-weight: 900;
          content: "Total  ${money(total)}";
        }
      `}</style>
      <div className="web-rider-map-drawer-fix relative h-full w-full">
        <RiderNavigation initialJob={job} onBack={() => router.replace("/rider")} />
      </div>
    </div>
  );
}
