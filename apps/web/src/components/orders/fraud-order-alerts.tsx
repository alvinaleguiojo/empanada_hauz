import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";

function severityTone(severity: string) {
  if (severity === "critical") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (severity === "high") return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (severity === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
}

export function FraudOrderAlerts({ orders, logs }: { orders: Array<any>; logs: Array<any> }) {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const alerts = logs
    .filter((log) => log.entityType === "customer" && log.orderId && ordersById.has(log.orderId))
    .map((log) => ({ ...log, order: ordersById.get(log.orderId) }))
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

  if (alerts.length === 0) return null;

  const uniqueAlerts = Array.from(new Map(alerts.map((alert) => [alert.orderId, alert])).values());

  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300">
            <ShieldAlert size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-100">Fraud alerts on today&apos;s orders</p>
            <p className="mt-0.5 text-xs text-foreground/50">These orders matched an open customer fraud case.</p>
          </div>
        </div>
        <Link href="/fraud" className="shrink-0 text-xs font-semibold text-accent hover:underline">Open Fraud Center</Link>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {uniqueAlerts.map((alert) => (
          <Link
            key={alert.orderId}
            href={`/orders?order=${encodeURIComponent(String(alert.orderId))}`}
            className={`group rounded-lg border px-3 py-2.5 transition hover:border-red-400/60 hover:bg-white/[0.03] ${severityTone(alert.severity)}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">FRAUD · {String(alert.severity ?? "unknown").toUpperCase()}</span>
              <span className="text-[10px] font-semibold opacity-70">Score {alert.score}</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{alert.order?.customer?.name ?? "Unknown customer"}</p>
            <p className="text-xs opacity-70">{alert.order?.orderNumber ?? alert.orderId}</p>
            <p className="mt-1 text-[11px] opacity-65">Matched: {Array.isArray(alert.matchedOn) ? alert.matchedOn.join(", ") : "customer"}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold opacity-70 group-hover:opacity-100">
              Open order <ArrowRight size={12} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
