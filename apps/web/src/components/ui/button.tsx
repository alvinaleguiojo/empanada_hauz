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
        variant === "default" && "bg-accent text-white shadow-sm shadow-accent/20 hover:bg-accent/90",
        variant === "secondary" && "border border-line bg-white/[0.06] text-foreground hover:bg-white/[0.1]",
        variant === "ghost" && "bg-transparent text-foreground/78 hover:bg-white/[0.06] hover:text-foreground",
        variant === "danger" && "bg-danger text-white shadow-sm shadow-danger/20 hover:bg-danger/90",
        className
      )}
      {...props}
    />
  );
}
