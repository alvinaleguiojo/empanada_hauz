import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent" | "success" | "danger";
  icon?: LucideIcon;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[3px]",
          tone === "neutral" && "bg-foreground/20",
          tone === "accent" && "bg-accent",
          tone === "success" && "bg-success",
          tone === "danger" && "bg-danger"
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground/55">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
              tone === "neutral" && "bg-foreground/10 text-foreground/60",
              tone === "accent" && "bg-accent/12 text-accent",
              tone === "success" && "bg-success/12 text-success",
              tone === "danger" && "bg-danger/12 text-danger"
            )}
          >
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-2 text-xs text-foreground/45">{hint}</p> : null}
    </Card>
  );
}
