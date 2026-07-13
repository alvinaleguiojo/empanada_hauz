import { cn } from "@/lib/utils";
import * as React from "react";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      suppressHydrationWarning
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-white/[0.09] bg-[#1a140d]/80 px-3.5 text-sm text-foreground outline-none ring-0 transition",
        "shadow-inner shadow-black/25 placeholder:text-foreground/34 hover:border-white/[0.16] focus:border-accent/70 focus:bg-[#111c2f] focus:shadow-[0_0_0_3px_rgb(var(--accent)/0.12)]",
        props.className
      )}
    />
  );
});
