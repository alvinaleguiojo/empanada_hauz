import { cn } from "@/lib/utils";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/[0.08] bg-panel/78 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl",
        "ring-1 ring-white/[0.025]",
        className
      )}
      {...props}
    />
  );
}
