"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

function severityTone(severity: string) {
  if (severity === "critical") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (severity === "high") return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (severity === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-yellow-500/30 bg-yellow-500/10 text-yellow-200";
}

function fraudBadgeTone(severity: string) {
  if (severity === "critical") return "border-red-400/60 bg-red-500/25 text-red-100";
  if (severity === "high") return "border-orange-400/60 bg-orange-500/25 text-orange-100";
  if (severity === "medium") return "border-amber-400/60 bg-amber-500/25 text-amber-100";
  return "border-yellow-400/60 bg-yellow-500/25 text-yellow-100";
}

function getMatchedFields(order: any) {
  const matches = Array.isArray(order?.fraud?.matches) ? order.fraud.matches : [];
  const matched = new Set<string>();
  matches.forEach((match: any) => {
    if (Array.isArray(match?.matchedOn)) {
      match.matchedOn.forEach((field: unknown) => {
        if (field) matched.add(String(field));
      });
    }
  });
  return [...matched];
}

function formatMatchedFields(order: any) {
  const fields = getMatchedFields(order);
  if (fields.length === 0) return "Open fraud case matched";
  return fields
    .map((field) => field.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " "))
    .join(" + ");
}

export function FraudOrderAlerts({ orders, logs }: { orders: Array<any>; logs: Array<any> }) {
  const ordersById = new Map(orders.map((order) => [order.id, order]));

  const flaggedOrders = useMemo(
    () => orders.filter((order) => order?.fraud?.matched && order?.orderNumber),
    [orders]
  );

  const alerts = [
    ...logs
      .filter((log) => log.entityType === "customer" && log.orderId && ordersById.has(log.orderId))
      .map((log) => ({ ...log, order: ordersById.get(log.orderId) })),
    ...flaggedOrders.flatMap((order) =>
      (Array.isArray(order.fraud?.matches) ? order.fraud.matches : []).map((match: any) => ({
        orderId: order.id,
        order,
        score: match.score,
        matchedOn: match.matchedOn,
        severity: match.severity ?? order.fraud.severity
      }))
    )
  ];

  const uniqueAlerts = Array.from(
    new Map(
      alerts
        .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
        .map((alert) => [alert.orderId, alert])
    ).values()
  );

  useEffect(() => {
    const syncInlineBadges = () => {
      const activeOrderNumbers = new Set(flaggedOrders.map((order) => String(order.orderNumber)));

      document.querySelectorAll<HTMLElement>("[data-fraud-order-badge]").forEach((badge) => {
        if (!activeOrderNumbers.has(badge.dataset.orderNumber ?? "")) badge.remove();
      });

      flaggedOrders.forEach((order) => {
        const orderNumber = String(order.orderNumber);
        const severity = String(order.fraud?.severity ?? "medium");
        const matchedFields = formatMatchedFields(order);
        const existing = document.querySelector<HTMLElement>(
          `[data-fraud-order-badge][data-order-number="${CSS.escape(orderNumber)}"]`
        );

        if (existing) {
          existing.textContent = `🚨 FRAUD · ${severity.toUpperCase()} · ${matchedFields}`;
          existing.title = `Fraud match: ${matchedFields}`;
          existing.className = `mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${fraudBadgeTone(severity)}`;
          return;
        }

        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
        const orderCard = buttons.find((button) => button.textContent?.includes(orderNumber));
        if (!orderCard) return;

        const badge = document.createElement("span");
        badge.dataset.fraudOrderBadge = "true";
        badge.dataset.orderNumber = orderNumber;
        badge.className = `mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${fraudBadgeTone(severity)}`;
        badge.textContent = `🚨 FRAUD · ${severity.toUpperCase()} · ${matchedFields}`;
        badge.title = `Fraud match: ${matchedFields}`;
        badge.setAttribute("role", "status");
        badge.setAttribute("aria-label", `Fraud order. ${severity} severity. Matched on ${matchedFields}.`);
        orderCard.prepend(badge);
      });
    };

    syncInlineBadges();
    const observer = new MutationObserver(syncInlineBadges);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(syncInlineBadges, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.querySelectorAll("[data-fraud-order-badge]").forEach((badge) => badge.remove());
    };
  }, [flaggedOrders]);

  if (uniqueAlerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300">
            <ShieldAlert size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-100">Fraud alerts on today&apos;s orders</p>
            <p className="mt-0.5 text-xs text-foreground/50">These orders matched an open customer fraud case using the phone plus another identifying detail.</p>
          </div>
        </div>
        <Link href="/fraud" className="shrink-0 text-xs font-semibold text-accent hover:underline">Open Fraud Center</Link>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {uniqueAlerts.map((alert) => (
          <div key={`${alert.orderId}-${alert.score}`} className={`rounded-lg border px-3 py-2.5 ${severityTone(alert.severity)}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">FRAUD · {String(alert.severity ?? "unknown").toUpperCase()}</span>
              <span className="text-[10px] font-semibold opacity-70">Score {alert.score}</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{alert.order?.customer?.name ?? "Unknown customer"}</p>
            <p className="text-xs opacity-70">{alert.order?.orderNumber ?? alert.orderId}</p>
            <p className="mt-1 text-[11px] opacity-65">Matched: {Array.isArray(alert.matchedOn) ? alert.matchedOn.join(", ") : "phone + identifying detail"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
