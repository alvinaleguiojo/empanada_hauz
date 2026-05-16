import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-md bg-white/[0.08] px-2 py-1 text-xs font-semibold text-foreground/85", className)}>
      {children}
    </span>
  );
}
