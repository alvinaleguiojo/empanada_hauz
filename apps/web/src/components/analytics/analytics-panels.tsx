import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TrendItem = {
  label: string;
  value: number;
};

type TopLocation = {
  location: string | null;
  _count?: {
    _all?: number;
  };
};

type TopItem = {
  name: string;
  quantity: number;
};

type AnalyticsData = {
  revenueTrend?: TrendItem[];
  piecesTrend?: TrendItem[];
  topLocations?: TopLocation[];
  topItems?: TopItem[];
};

export function AnalyticsPanels({ data, rangeLabel = "Today" }: { data: AnalyticsData; rangeLabel?: string }) {
  const rangeText = rangeLabel.toLowerCase();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-h-[330px] p-5">
          <PanelHeader title="Revenue Trend" subtitle={`Completed sales, ${rangeText}`} />
          <BarTrend items={data.revenueTrend ?? []} tone="accent" valueFormatter={(value) => `Php ${formatCompact(value)}`} />
        </Card>
        <Card className="min-h-[330px] p-5">
          <PanelHeader title="Pieces Sold Trend" subtitle={`Completed sales, ${rangeText}`} />
          <BarTrend items={data.piecesTrend ?? []} tone="success" valueFormatter={(value) => `${formatCompact(value)} pcs`} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
        <Card className="p-5">
          <PanelHeader title="Most Ordered Items" subtitle={`${rangeLabel}, completed orders`} />
          <RankedList
            emptyLabel="No completed item orders yet."
            items={(data.topItems ?? []).map((item) => ({
              label: item.name,
              value: item.quantity,
              valueLabel: `${item.quantity} pcs`
            }))}
            tone="accent"
          />
        </Card>

        <Card className="p-5">
          <PanelHeader title="Top Locations" subtitle={`${rangeLabel}, scheduled or created orders`} />
          <RankedList
            emptyLabel="No locations for today yet."
            items={(data.topLocations ?? []).map((item) => {
              const count = item._count?._all ?? 0;
              return {
                label: item.location ?? "Unknown",
                value: count,
                valueLabel: `${count} order${count === 1 ? "" : "s"}`
              };
            })}
            tone="success"
          />
        </Card>
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-xs text-foreground/45">{subtitle}</p>
      </div>
    </div>
  );
}

function BarTrend({
  items,
  tone,
  valueFormatter
}: {
  items: TrendItem[];
  tone: "accent" | "success";
  valueFormatter: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  if (items.length === 0) {
    return <EmptyState label="No trend data yet." />;
  }

  const width = 720;
  const height = 230;
  const paddingX = 44;
  const top = 22;
  const bottom = 52;
  const plotHeight = height - top - bottom;
  const points = items.map((item, index) => {
    const value = Number(item.value) || 0;
    const x = items.length === 1 ? width / 2 : paddingX + (index / (items.length - 1)) * (width - paddingX * 2);
    const y = top + (1 - value / max) * plotHeight;
    return { ...item, value, x, y };
  });
  const path = createSmoothPath(points);
  const fillPath = path ? `${path} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z` : "";
  const highlight = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const gradientId = `trend-fill-${tone}`;
  const glowId = `trend-glow-${tone}`;
  const lineColor = tone === "accent" ? "#ff5f94" : "#30d18e";
  const lineEndColor = tone === "accent" ? "#ffb03d" : "#55e7ff";
  const guideColor = tone === "accent" ? "#36d7ff" : "#41f3ca";

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-white/[0.08] bg-[#171a49] shadow-inner shadow-white/[0.03]">
      <svg className="h-56 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend line chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={tone === "accent" ? "#ff5f94" : "#30d18e"} stopOpacity="0.34" />
            <stop offset="100%" stopColor="#3a1d7a" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id={`${gradientId}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#ffd23f" />
            <stop offset="44%" stopColor={lineColor} />
            <stop offset="100%" stopColor={lineEndColor} />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 1  0 0.25 0 0 0.28  0 0 0.45 0 0.65  0 0 0 0.75 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={width} height={height} fill="#171a49" />
        <rect width={width} height={height} fill="url(#chart-backdrop)" opacity="0" />
        <path d={`M0 0 H${width} V${height} H0 Z`} fill="url(#trend-panel-gradient)" opacity="0" />
        <path d={fillPath} fill={`url(#${gradientId})`} />
        {points.map((point) => (
          <g key={point.label}>
            <line x1={point.x} x2={point.x} y1={top + 10} y2={height - bottom + 8} stroke={guideColor} strokeOpacity="0.62" strokeWidth="2" />
            <circle cx={point.x} cy={height - bottom + 10} r="2.4" fill={guideColor} opacity="0.9" />
          </g>
        ))}
        <path d={path} fill="none" stroke={`url(#${gradientId}-line)`} strokeLinecap="round" strokeLinejoin="round" strokeWidth="6.5" filter={`url(#${glowId})`} />
        {highlight ? (
          <g>
            <circle cx={highlight.x} cy={highlight.y} r="18" fill="#1a2052" stroke={lineColor} strokeWidth="6" />
            <circle cx={highlight.x} cy={highlight.y} r="7" fill={lineColor} opacity="0.92" />
          </g>
        ) : null}
        {points.map((point) => (
          <g key={`${point.label}-label`}>
            <title>{`${point.label}: ${valueFormatter(point.value)}`}</title>
            <text x={point.x} y={height - 18} textAnchor="middle" fill="#55dff6" fontSize="16" fontWeight="700">
              {compactLabel(point.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function createSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (afterNext.x - current.x) / 6;
    const cp2y = next.y - (afterNext.y - current.y) / 6;
    commands.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`);
  }

  return commands.join(" ");
}

function compactLabel(label: string) {
  const trimmed = label.trim();
  if (trimmed.length <= 5) {
    return trimmed;
  }
  return trimmed.slice(0, 5);
}

function RankedList({
  items,
  emptyLabel,
  tone
}: {
  items: Array<{ label: string; value: number; valueLabel: string }>;
  emptyLabel: string;
  tone: "accent" | "success";
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="mt-5 space-y-3">
      {items.map((item, index) => {
        const width = Math.max((item.value / max) * 100, 6);
        return (
          <div key={`${item.label}-${index}`} className="rounded-lg border border-line/70 bg-black/[0.06] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground/88">{item.label}</p>
                <p className="mt-1 text-xs text-foreground/45">Rank {index + 1}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold">{item.valueLabel}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : "bg-success")} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-5 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-line/75 bg-black/[0.04] px-4 text-center">
      <p className="text-sm text-foreground/45">{label}</p>
    </div>
  );
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
