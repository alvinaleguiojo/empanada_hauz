"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  label: string;
  value: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-white/[0.09] bg-[#1a140d]/80 px-3.5 text-left text-sm text-foreground shadow-inner shadow-black/25 transition hover:border-white/[0.16] focus:border-accent/70 focus:shadow-[0_0_0_3px_rgb(var(--accent)/0.12)]"
      >
        <span className={cn(!selected && "text-foreground/45")}>{selected?.label ?? placeholder ?? "Select"}</span>
        <ChevronDown size={18} className={cn("shrink-0 text-foreground/45 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-lg border border-white/[0.1] bg-[#241c13]/95 p-1.5 shadow-2xl shadow-black/45 backdrop-blur-xl">
          <div className="space-y-1">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  suppressHydrationWarning
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition",
                    active ? "bg-accent text-white shadow-sm shadow-accent/20" : "text-foreground/78 hover:bg-white/[0.08] hover:text-foreground"
                  )}
                >
                  <span>{option.label}</span>
                  {active ? <Check size={16} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
