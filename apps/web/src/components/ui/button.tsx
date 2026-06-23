import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      suppressHydrationWarning
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/75",
        variant === "default" &&
          "bg-[linear-gradient(135deg,rgb(var(--accent)),#ff8a4d)] text-white shadow-[0_14px_34px_rgb(var(--accent)/0.24)] hover:brightness-110",
        variant === "secondary" && "border border-white/[0.1] bg-white/[0.07] text-foreground shadow-inner shadow-white/[0.03] hover:bg-white/[0.12]",
        variant === "ghost" && "bg-transparent text-foreground/78 hover:bg-white/[0.08] hover:text-foreground",
        variant === "danger" && "bg-danger text-white shadow-[0_14px_34px_rgb(var(--danger)/0.22)] hover:brightness-110",
        className
      )}
      {...props}
    />
  );
}
