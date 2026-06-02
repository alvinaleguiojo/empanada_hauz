import { cn } from "@/lib/utils";
import * as React from "react";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      suppressHydrationWarning
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-line/80 bg-black/10 px-3.5 text-sm text-foreground outline-none ring-0 transition placeholder:text-foreground/38 hover:border-foreground/18 focus:border-accent/60 focus:bg-black/15",
        props.className
      )}
    />
  );
});
