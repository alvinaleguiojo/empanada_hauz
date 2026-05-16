import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent" | "success" | "danger";
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div
        className={cn(
          "absolute right-4 top-4 h-2 w-2 rounded-full",
          tone === "neutral" && "bg-foreground/25",
          tone === "accent" && "bg-accent",
          tone === "success" && "bg-success",
          tone === "danger" && "bg-danger"
        )}
      />
      <p className="text-sm font-medium text-foreground/55">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-2 text-xs text-foreground/45">{hint}</p> : null}
    </Card>
  );
}
