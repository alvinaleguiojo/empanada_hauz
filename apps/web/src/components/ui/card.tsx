import { cn } from "@/lib/utils";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line/80 bg-panel p-5 shadow-sm shadow-black/10", className)} {...props} />;
}
