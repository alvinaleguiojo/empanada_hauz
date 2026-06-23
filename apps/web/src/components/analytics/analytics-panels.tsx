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
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 p-4 sm:min-h-[330px] sm:p-5">
          <PanelHeader title="Revenue Trend" subtitle={`Completed sales, ${rangeText}`} />
          <BarTrend items={data.revenueTrend ?? []} tone="accent" valueFormatter={(value) => `Php ${formatCompact(value)}`} />
        </Card>
        <Card className="min-w-0 p-4 sm:min-h-[330px] sm:p-5">
          <PanelHeader title="Pieces Sold Trend" subtitle={`Completed sales, ${rangeText}`} />
          <BarTrend items={data.piecesTrend ?? []} tone="success" valueFormatter={(value) => `${formatCompact(value)} pcs`} />
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-1">
        <Card className="min-w-0 p-4 sm:p-5">
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

        <Card className="min-w-0 p-4 sm:p-5">
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

  const width = 640;
  const height = 260;
  const paddingX = 58;
  const top = 34;
  const bottom = 58;
  const plotHeight = height - top - bottom;
  const niceMax = Math.max(Math.ceil(max / 4) * 4, 4);
  const points = items.map((item, index) => {
    const value = Number(item.value) || 0;
    const x = items.length === 1 ? width / 2 : paddingX + (index / (items.length - 1)) * (width - paddingX * 2);
    const y = top + (1 - value / niceMax) * plotHeight;
    return { ...item, index, value, x, y };
  });
  const path = createSmoothPath(points);
  const fillPath = path ? `${path} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z` : "";
  const displayPoints = getDisplayPoints(points, 5);
  const activePoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const yTicks = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25].map((value) => ({
    value,
    y: top + (1 - value / niceMax) * plotHeight
  }));
  const gradientId = `trend-fill-${tone}`;
  const lineGradientId = `trend-line-${tone}`;
  const lineColor = tone === "accent" ? "rgb(var(--accent))" : "rgb(var(--success))";
  const lineSoftColor = tone === "accent" ? "#ffb347" : "#55e7ff";
  const mutedText = "#91a0bb";

  return (
    <div className="mt-5 min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[linear-gradient(145deg,rgba(30,39,65,0.92),rgba(20,27,45,0.96))] shadow-inner shadow-white/[0.03] sm:mt-6">
      <svg className="block aspect-[2.35/1] w-full max-w-full sm:aspect-[2.75/1]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend line chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.32" />
            <stop offset="72%" stopColor={lineColor} stopOpacity="0.08" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineGradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={lineSoftColor} />
            <stop offset="45%" stopColor={lineColor} />
            <stop offset="100%" stopColor={tone === "accent" ? "#ff7a45" : "#30d18e"} />
          </linearGradient>
        </defs>

        <rect width={width} height={height} rx="20" fill="transparent" />
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={paddingX} x2={width - paddingX} y1={tick.y} y2={tick.y} stroke="white" strokeOpacity="0.045" strokeWidth="1" />
            <text x={18} y={tick.y + 5} fill={mutedText} fontSize="15" fontWeight="600" opacity="0.82">
              {formatTick(tick.value)}
            </text>
          </g>
        ))}
        <path d={fillPath} fill={`url(#${gradientId})`} />
        {activePoint ? (
          <g>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={activePoint.y + 8}
              y2={height - bottom}
              stroke={lineColor}
              strokeDasharray="9 9"
              strokeLinecap="round"
              strokeOpacity="0.72"
              strokeWidth="3"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r="7" fill="rgb(var(--panel))" stroke={lineColor} strokeWidth="4" />
          </g>
        ) : null}
        <path d={path} fill="none" stroke={`url(#${lineGradientId})`} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
        {displayPoints.map((point) => (
          <g key={`${point.label}-${point.index}-label`}>
            <title>{`${point.label}: ${valueFormatter(point.value)}`}</title>
            <text
              x={point.x}
              y={height - 20}
              textAnchor="middle"
              fill={activePoint?.index === point.index ? lineColor : mutedText}
              fontSize="15"
              fontWeight={activePoint?.index === point.index ? "800" : "600"}
            >
              {compactDateLabel(point.label, point.index)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function getDisplayPoints<T extends { index: number; x: number; y: number }>(points: T[], maxCount: number) {
  if (points.length <= maxCount) {
    return points;
  }

  const lastIndex = points.length - 1;
  const indexes = new Set<number>();
  for (let slot = 0; slot < maxCount; slot += 1) {
    indexes.add(Math.round((slot / (maxCount - 1)) * lastIndex));
  }

  return points.filter((point) => indexes.has(point.index));
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

function compactDateLabel(label: string, index: number) {
  const trimmed = label.trim();
  const dayMatch = trimmed.match(/\b[A-Za-z]{3,9}\s+(\d{1,2})\b/);
  if (dayMatch) {
    return dayMatch[1];
  }

  const monthMatch = trimmed.match(/\b([A-Za-z]{3,9})\b/);
  if (monthMatch) {
    return monthMatch[1].slice(0, 3);
  }

  if (trimmed.length <= 6) {
    return trimmed;
  }
  return `P${index + 1}`;
}

function formatTick(value: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
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
          <div
            key={`${item.label}-${index}`}
            className={cn(
              "rounded-lg border p-3 shadow-[0_18px_50px_rgba(0,0,0,0.16)]",
              tone === "accent"
                ? "border-orange-300/15 bg-[linear-gradient(135deg,rgba(255,106,52,0.14),rgba(255,255,255,0.035)_48%,rgba(255,184,76,0.08))]"
                : "border-emerald-300/15 bg-[linear-gradient(135deg,rgba(48,209,142,0.16),rgba(255,255,255,0.035)_48%,rgba(85,231,255,0.08))]"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground/88">{item.label}</p>
                <span
                  className={cn(
                    "mt-2 inline-flex rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-sm",
                    tone === "accent" ? "bg-[linear-gradient(135deg,#ff6638,#ffb347)]" : "bg-[linear-gradient(135deg,#24d38d,#55e7ff)]"
                  )}
                >
                  Rank {index + 1}
                </span>
              </div>
              <p className="shrink-0 text-sm font-semibold">{item.valueLabel}</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.08] shadow-inner shadow-black/30">
              <div
                className={cn("h-full rounded-full", tone === "accent" ? "bg-[linear-gradient(90deg,#ff6638,#ffb347)]" : "bg-[linear-gradient(90deg,#24d38d,#55e7ff)]")}
                style={{ width: `${width}%` }}
              />
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
