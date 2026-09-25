"use client";

import { useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Coins,
  Loader2,
  MapPinned,
  Package,
  ShoppingBag,
  UsersRound,
  Wallet,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CustomerOriginMap } from "@/components/analytics/customer-origin-map";
import { CashFlowSummary, rangeOptions, type CashFlowData, type CashRange } from "@/components/dashboard/cash-flow-summary";
import { LiveEvents } from "@/components/dashboard/live-events";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export type DashboardData = {
  range?: CashRange;
  rangeLabel?: string;
  startDate?: string;
  endDate?: string;
  revenueToday: number;
  pcsSoldToday: number;
  averageOrderSize: number;
  repeatCustomerCount: number;
  repeatCustomerRate: number;
  repeatCustomers?: Array<{ id: string; name: string; orderCount: number }>;
  cancelledOrders: number;
  productionEfficiency: number;
  ordersToday: number;
  activeOrdersToday: number;
  expensesToday: number;
  moneyOnHandToday: number;
  topLocations: Array<{ location: string | null; _count?: { _all?: number } }>;
  topItems?: Array<{ name: string; quantity: number }>;
  revenueTrend: Array<{ label: string; value: number }>;
  piecesTrend: Array<{ label: string; value: number }>;
  cashFlow: CashFlowData;
};

export function DashboardView({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [loadingRange, setLoadingRange] = useState<CashRange | null>(null);
  const [customOpen, setCustomOpen] = useState(initialData.range === "custom");
  const [customStartDate, setCustomStartDate] = useState(initialData.startDate ?? initialData.cashFlow?.startDate ?? "");
  const [customEndDate, setCustomEndDate] = useState(initialData.endDate ?? initialData.cashFlow?.endDate ?? "");
  const [error, setError] = useState("");
  const [showOriginMap, setShowOriginMap] = useState(false);
  const requestIdRef = useRef(0);

  const activeRange = data.range ?? data.cashFlow?.range ?? "today";
  const rangeLabel = data.rangeLabel ?? data.cashFlow?.label ?? "Today";
  const rangeText = rangeLabel.toLowerCase();
  const topItem = (data.topItems ?? [])[0];
  const topProductShare = data.pcsSoldToday > 0 && topItem ? Math.round((topItem.quantity / data.pcsSoldToday) * 100) : 0;
  const netToday = Number(data.revenueToday ?? 0) - Number(data.expensesToday ?? 0);

  async function selectRange(range: CashRange) {
    if (range === activeRange || loadingRange) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingRange(range);
    setError("");
    try {
      const nextData = await apiFetch<DashboardData>(`/analytics/overview?range=${range}`);
      if (requestId !== requestIdRef.current) return;
      setData(nextData);
      setCustomStartDate(nextData.startDate ?? nextData.cashFlow?.startDate ?? "");
      setCustomEndDate(nextData.endDate ?? nextData.cashFlow?.endDate ?? "");
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
    } finally {
      if (requestId === requestIdRef.current) setLoadingRange(null);
    }
  }

  async function loadCustomRange(startDate: string, endDate: string, closeOnSuccess = false) {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setError("Start date must be before or equal to end date.");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingRange("custom");
    setError("");

    try {
      const params = new URLSearchParams({ range: "custom", startDate, endDate });
      const nextData = await apiFetch<DashboardData>(`/analytics/overview?${params.toString()}`);
      if (requestId !== requestIdRef.current) return;
      setData(nextData);
      setCustomStartDate(nextData.startDate ?? nextData.cashFlow?.startDate ?? startDate);
      setCustomEndDate(nextData.endDate ?? nextData.cashFlow?.endDate ?? endDate);
      if (closeOnSuccess) setCustomOpen(false);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
    } finally {
      if (requestId === requestIdRef.current) setLoadingRange(null);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(255,116,67,0.18),transparent_35%),linear-gradient(145deg,#0b1220,#121c30_58%,#16213a)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.24)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                Live operations
              </span>
              <span className="text-[11px] font-medium text-white/35">{rangeLabel}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Operations dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
              A clearer view of sales, production, customer demand, and live order activity for {rangeText}.
            </p>
          </div>

          <div className="w-full xl:w-auto">
            <div className="inline-flex w-full rounded-xl border border-white/10 bg-black/15 p-1 backdrop-blur xl:w-auto">
              {rangeOptions.map((option) => {
                const active = option.value === activeRange;
                const loading = loadingRange === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => void selectRange(option.value)}
                    className={cn("inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition xl:flex-none",
                      active ? "bg-white text-slate-900 shadow-lg" : "text-white/55 hover:bg-white/[0.06] hover:text-white")}>
                    {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                    {option.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setCustomOpen((open) => !open)}
                className={cn("inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition xl:flex-none",
                  activeRange === "custom" ? "bg-white text-slate-900 shadow-lg" : "text-white/55 hover:bg-white/[0.06] hover:text-white")}>
                <CalendarDays size={15} />
                Custom
              </button>
            </div>

            {customOpen ? (
              <div className="mt-2 grid w-full gap-2 rounded-xl border border-white/10 bg-[#101827]/95 p-3 shadow-xl sm:grid-cols-[1fr_1fr_auto] xl:w-[520px]">
                <Input type="date" aria-label="Start date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} className="h-9 border-white/10 bg-white/[0.04]" />
                <Input type="date" aria-label="End date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} className="h-9 border-white/10 bg-white/[0.04]" />
                <Button type="button" onClick={() => void loadCustomRange(customStartDate, customEndDate, true)} disabled={!customStartDate || !customEndDate || loadingRange === "custom"} className="h-9 px-3">
                  {loadingRange === "custom" ? <Loader2 size={15} className="animate-spin" /> : null}
                  Apply
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.2fr_repeat(3,1fr)]">
          <HeroMetric label="Revenue" value={formatPeso(data.revenueToday)} meta={`${data.ordersToday ?? 0} orders`} icon={Coins} emphasis />
          <HeroMetric label="Net cash" value={formatPeso(netToday)} meta={`${formatPeso(data.expensesToday)} expenses`} icon={Wallet} />
          <HeroMetric label="Pieces" value={formatNumber(data.pcsSoldToday)} meta={`${formatNumber(data.averageOrderSize, 1)} avg/order`} icon={Package} />
          <HeroMetric label="Active now" value={formatNumber(data.activeOrdersToday)} meta="open orders" icon={Activity} />
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          <CircleAlert size={17} />
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SignalCard label="Completion" value={`${formatNumber(data.productionEfficiency)}%`} caption={`${data.cancelledOrders ?? 0} cancelled`} icon={CheckCircle2} tone="success" />
        <SignalCard label="Repeat customers" value={formatNumber(data.repeatCustomerCount)} caption={`${formatNumber(data.repeatCustomerRate, 1)}% of customers`} icon={UsersRound} />
        <SignalCard label="Avg order" value={`${formatNumber(data.averageOrderSize, 1)} pcs`} caption="Average pieces per order" icon={ShoppingBag} />
        <SignalCard label="Best product" value={topItem?.name ?? "—"} caption={topItem ? `${topItem.quantity} pcs • ${topProductShare}% of volume` : "No completed items yet"} icon={BarChart3} compactValue />
        <SignalCard label="Cash position" value={formatPeso(data.moneyOnHandToday)} caption={data.moneyOnHandToday >= 0 ? "Positive balance" : "Negative balance"} icon={Zap} tone={data.moneyOnHandToday >= 0 ? "accent" : "danger"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <TrendCard title="Revenue momentum" subtitle={`Completed sales • ${rangeLabel}`} items={data.revenueTrend ?? []} formatter={(value) => formatPeso(value)} accent="orange" icon={Coins} />
        <OperationsPulse data={data} rangeLabel={rangeLabel} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TrendCard title="Order volume" subtitle={`Pieces sold • ${rangeLabel}`} items={data.piecesTrend ?? []} formatter={(value) => `${formatNumber(value)} pcs`} accent="cyan" icon={Package} />
        <TopItemsCard items={data.topItems ?? []} />
      </section>

      <CashFlowSummary data={data.cashFlow} />

      <section className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
                <MapPinned size={15} />
              </span>
              <div>
                <p className="text-sm font-semibold">Customer origin map</p>
                <p className="text-xs text-foreground/42">Load geographic demand only when you need it.</p>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant={showOriginMap ? "outline" : "default"}
            onClick={() => setShowOriginMap((open) => !open)}
            className="shrink-0"
          >
            {showOriginMap ? "Hide map" : "Show map"}
          </Button>
        </div>
        {showOriginMap ? (
          <div className="border-t border-white/8 p-3 sm:p-4">
            <CustomerOriginMap locations={data.topLocations ?? []} rangeLabel={rangeLabel} />
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <RepeatCustomersPanel customers={data.repeatCustomers ?? []} rangeLabel={rangeLabel} />
        <LiveEvents />
      </section>
    </div>
  );
}

function HeroMetric({ label, value, meta, icon: Icon, emphasis = false }: { label: string; value: string; meta: string; icon: LucideIcon; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-4 backdrop-blur-md", emphasis ? "border-orange-300/15 bg-white/[0.07]" : "border-white/[0.08] bg-white/[0.035]")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-white/65"><Icon size={15} /></span>
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/38">{meta}</p>
    </div>
  );
}

function SignalCard({ label, value, caption, icon: Icon, tone = "neutral", compactValue = false }: { label: string; value: string; caption: string; icon: LucideIcon; tone?: "neutral" | "success" | "accent" | "danger"; compactValue?: boolean }) {
  return (
    <Card className="relative overflow-hidden border-white/8 bg-white/[0.025] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", tone === "success" && "bg-success", tone === "accent" && "bg-accent", tone === "danger" && "bg-danger", tone === "neutral" && "bg-white/15")} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-foreground/40">{label}</p>
          <p className={cn("mt-2 truncate font-semibold tracking-tight", compactValue ? "text-base" : "text-xl", tone === "danger" && "text-danger", tone === "success" && "text-success", tone === "accent" && "text-accent")}>{value}</p>
          <p className="mt-1 text-xs text-foreground/42">{caption}</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground/55"><Icon size={15} /></span>
      </div>
    </Card>
  );
}

function OperationsPulse({ data, rangeLabel }: { data: DashboardData; rangeLabel: string }) {
  const completion = Math.max(0, Math.min(100, Number(data.productionEfficiency ?? 0)));
  const repeatRate = Math.max(0, Math.min(100, Number(data.repeatCustomerRate ?? 0)));
  const cancellationRate = Math.max(0, Math.min(100, data.ordersToday > 0 ? (Number(data.cancelledOrders ?? 0) / Number(data.ordersToday)) * 100 : 0));

  return (
    <Card className="overflow-hidden border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-0">
      <div className="border-b border-line/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-accent" />
          <div><p className="text-sm font-semibold">Operations pulse</p><p className="text-xs text-foreground/42">{rangeLabel} health indicators</p></div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <PulseRow label="Completion rate" value={`${formatNumber(completion)}%`} percent={completion} tone="success" />
        <PulseRow label="Repeat customer rate" value={`${formatNumber(repeatRate, 1)}%`} percent={repeatRate} tone="accent" />
        <PulseRow label="Cancellation rate" value={`${formatNumber(cancellationRate, 1)}%`} percent={cancellationRate} tone="danger" />
        <div className="grid grid-cols-2 gap-3 pt-1">
          <MiniPulse label="Orders" value={formatNumber(data.ordersToday)} icon={ShoppingBag} />
          <MiniPulse label="Active" value={formatNumber(data.activeOrdersToday)} icon={Activity} />
          <MiniPulse label="Expenses" value={formatPeso(data.expensesToday)} icon={Wallet} />
          <MiniPulse label="On hand" value={formatPeso(data.moneyOnHandToday)} icon={Coins} />
        </div>
      </div>
    </Card>
  );
}

function PulseRow({ label, value, percent, tone }: { label: string; value: string; percent: number; tone: "success" | "accent" | "danger" }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-foreground/56">{label}</span><span className={cn("font-semibold tabular-nums", tone === "success" && "text-success", tone === "accent" && "text-accent", tone === "danger" && "text-danger")}>{value}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div className={cn("h-full rounded-full", tone === "success" && "bg-[linear-gradient(90deg,#25d48f,#60e5b1)]", tone === "accent" && "bg-[linear-gradient(90deg,#ff6337,#ffb347)]", tone === "danger" && "bg-[linear-gradient(90deg,#dc5b6f,#ff9b54)]")} style={{ width: `${Math.max(percent, percent === 0 ? 0 : 3)}%` }} />
      </div>
    </div>
  );
}

function MiniPulse({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-line/70 bg-black/[0.06] px-3 py-2.5">
      <div className="flex items-center gap-2 text-foreground/40"><Icon size={13} /><span className="text-[10px] font-semibold uppercase tracking-[0.15em]">{label}</span></div>
      <p className="mt-1.5 truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TrendCard({ title, subtitle, items, formatter, accent, icon: Icon }: { title: string; subtitle: string; items: Array<{ label: string; value: number }>; formatter: (value: number) => string; accent: "orange" | "cyan"; icon: LucideIcon }) {
  return (
    <Card className="overflow-hidden border-white/8 bg-white/[0.025] p-0">
      <div className={cn("h-[3px] w-full", accent === "orange" ? "bg-[linear-gradient(90deg,#ff5e30,#ffb347,#ffd89d)]" : "bg-[linear-gradient(90deg,#2dd4bf,#4dd6ff,#c4f1ff)]")} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/38">Trend</p><h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2><p className="mt-1 text-xs text-foreground/42">{subtitle}</p></div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-foreground/[0.06] text-foreground/55"><Icon size={16} /></span>
        </div>
        <TrendChart items={items} formatter={formatter} accent={accent} />
      </div>
    </Card>
  );
}

function TrendChart({ items, formatter, accent }: { items: Array<{ label: string; value: number }>; formatter: (value: number) => string; accent: "orange" | "cyan" }) {
  if (!items.length) return <div className="mt-5 flex h-[260px] items-center justify-center rounded-2xl border border-dashed border-line/70 text-sm text-foreground/40">No trend data yet.</div>;

  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  const width = 720;
  const height = 280;
  const left = 20;
  const right = 18;
  const top = 22;
  const bottom = 46;
  const plotHeight = height - top - bottom;
  const points = items.map((item, index) => {
    const x = items.length === 1 ? width / 2 : left + (index / (items.length - 1)) * (width - left - right);
    const y = top + (1 - (Number(item.value) || 0) / max) * plotHeight;
    return { ...item, x, y, value: Number(item.value) || 0, index };
  });
  const path = points.length === 1 ? `M ${points[0].x} ${points[0].y}` : points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const fillPath = `${path} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`;
  const line = accent === "orange" ? "#ff7a45" : "#4dd6ff";
  const fill = accent === "orange" ? "rgba(255,122,69,0.14)" : "rgba(77,214,255,0.12)";
  const active = points.reduce((best, point) => point.value > best.value ? point : best, points[0]);
  const labels = getDisplayPoints(points, 6);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(15,24,40,0.95),rgba(10,18,31,0.98))]">
      <div className="px-3 pt-3"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-white/28"><span>{items[0]?.label ?? ""}</span><span>{items[items.length - 1]?.label ?? ""}</span></div></div>
      <svg className="block aspect-[2.4/1] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dashboard trend chart" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75, 1].map((tick) => { const y = top + (1 - tick) * plotHeight; return <line key={tick} x1={left} x2={width - right} y1={y} y2={y} stroke="white" strokeOpacity="0.045" />; })}
        <path d={fillPath} fill={fill} />
        <path d={path} fill="none" stroke={line} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {active ? <circle cx={active.x} cy={active.y} r="6" fill="#0d1726" stroke={line} strokeWidth="3" /> : null}
        {labels.map((point) => (
          <g key={`${point.index}-${point.label}`}>
            <title>{`${point.label}: ${formatter(point.value)}`}</title>
            <circle cx={point.x} cy={point.y} r="2.5" fill={line} opacity="0.75" />
            <text x={point.x} y={height - 14} textAnchor="middle" fill="white" fillOpacity={active?.index === point.index ? "0.88" : "0.36"} fontSize="13" fontWeight={active?.index === point.index ? "800" : "600"}>{compactDateLabel(point.label)}</text>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs"><span className="text-white/35">Peak</span><span className="font-semibold text-white/75">{active ? formatter(active.value) : "—"}</span></div>
    </div>
  );
}

function TopItemsCard({ items }: { items: Array<{ name: string; quantity: number }> }) {
  const max = Math.max(...items.map((item) => Number(item.quantity) || 0), 1);
  return (
    <Card className="overflow-hidden border-white/8 bg-white/[0.025] p-0">
      <div className="border-b border-line/60 px-5 py-4">
        <div className="flex items-center gap-2"><BarChart3 size={16} className="text-accent" /><div><p className="text-sm font-semibold">Product mix</p><p className="text-xs text-foreground/42">Most ordered flavors</p></div></div>
      </div>
      <div className="p-5">
        {items.length === 0 ? <EmptyState label="No completed product data yet." /> : (
          <div className="space-y-3">
            {items.slice(0, 6).map((item, index) => (
              <div key={`${item.name}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent/10 text-[10px] font-bold text-accent">{index + 1}</span><span className="truncate font-medium">{item.name}</span></div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatNumber(item.quantity)} pcs</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-foreground/[0.06]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ff6337,#ffb347)]" style={{ width: `${Math.max(5, (item.quantity / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function RepeatCustomersPanel({ customers, rangeLabel }: { customers: Array<{ id: string; name: string; orderCount: number }>; rangeLabel: string }) {
  return (
    <Card className="overflow-hidden border-white/8 bg-white/[0.025] p-0">
      <div className="border-b border-line/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><UsersRound size={16} className="text-cyan-300" /><div><p className="text-sm font-semibold">Customer retention</p><p className="text-xs text-foreground/42">{rangeLabel} repeat customers</p></div></div>
          <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-200">{customers.length} repeat</span>
        </div>
      </div>
      <div className="p-5">
        {customers.length === 0 ? <EmptyState label="No repeat customers for this range yet." /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {customers.slice(0, 8).map((customer, index) => (
              <div key={customer.id} className="flex items-center gap-3 rounded-xl border border-line/70 bg-black/[0.05] px-3 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-xs font-bold text-cyan-200">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{customer.name}</p><p className="mt-0.5 text-[11px] text-foreground/40">Returning customer</p></div>
                <span className="rounded-lg bg-foreground/[0.06] px-2 py-1 text-xs font-semibold tabular-nums">{customer.orderCount} orders</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line/70 bg-black/[0.03] px-4 text-center text-sm text-foreground/40">{label}</div>;
}

function getDisplayPoints<T extends { index: number }>(points: T[], maxCount: number) {
  if (points.length <= maxCount) return points;
  const last = points.length - 1;
  const indexes = new Set<number>();
  for (let slot = 0; slot < maxCount; slot += 1) indexes.add(Math.round((slot / (maxCount - 1)) * last));
  return points.filter((point) => indexes.has(point.index));
}

function compactDateLabel(label: string) {
  const trimmed = label.trim();
  const dayMatch = trimmed.match(/\\b[A-Za-z]{3,9}\\s+(\\d{1,2})\\b/);
  if (dayMatch) return dayMatch[1];
  const monthMatch = trimmed.match(/\\b([A-Za-z]{3,9})\\b/);
  if (monthMatch) return monthMatch[1].slice(0, 3);
  return trimmed.length <= 7 ? trimmed : "•";
}

function formatPeso(value: number) {
  return `Php ${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits });
}

