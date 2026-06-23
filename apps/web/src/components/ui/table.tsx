import { cn } from "@/lib/utils";
import * as React from "react";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-separate border-spacing-0 text-left text-sm", className)} {...props} />;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("bg-white/[0.035] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/48 first:rounded-l-lg last:rounded-r-lg", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-white/[0.06] px-4 py-3 text-foreground/78", className)} {...props} />;
}
