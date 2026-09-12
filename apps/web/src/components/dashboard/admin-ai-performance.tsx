"use client";

import { useEffect, useState } from "react";

type Summary = { count: number; averageMs: number; p50Ms: number; p95Ms: number; maxMs: number };
type Metric = { requestId: string; model?: string | null; totalMs: number; llmMs: number; toolMs: number; toolCalls: number; iterations: number; tools: Array<{ name: string; durationMs: number }>; createdAt: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function seconds(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`; }
function formatDate(value: string) { return new Date(value).toLocaleString(); }

export function AdminAiPerformance() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [nextSummary, nextMetrics] = await Promise.all([
        getJson<Summary>("/ai/admin/performance/summary"),
        getJson<Metric[]>("/ai/admin/performance?limit=25"),
      ]);
      setSummary(nextSummary);
      setMetrics(nextMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI performance metrics");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-4 rounded-lg border border-line/80 bg-panel p-5 shadow-sm shadow-black/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Admin AI</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Response performance</h2>
          <p className="mt-1 text-sm text-foreground/52">See where the agent spends time: LLM inference, tools, and agent iterations.</p>
        </div>
        <button onClick={() => { setLoading(true); void load(); }} className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-black/[0.04]">Refresh</button>
      </div>

      {error && <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Requests" value={summary ? String(summary.count) : "—"} />
        <MetricCard label="Average" value={summary ? seconds(summary.averageMs) : "—"} />
        <MetricCard label="P50" value={summary ? seconds(summary.p50Ms) : "—"} />
        <MetricCard label="P95" value={summary ? seconds(summary.p95Ms) : "—"} />
        <MetricCard label="Slowest" value={summary ? seconds(summary.maxMs) : "—"} />
      </div>

      <div className="overflow-x-auto rounded-md border border-line/70">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="border-b border-line/70 bg-black/[0.025] text-xs uppercase tracking-[0.1em] text-foreground/45">
            <tr><th className="px-3 py-3">Time</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">LLM</th><th className="px-3 py-3">Tools</th><th className="px-3 py-3">Calls</th><th className="px-3 py-3">Iterations</th><th className="px-3 py-3">Model</th><th className="px-3 py-3">Tool breakdown</th></tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {loading && !metrics.length ? <tr><td colSpan={8} className="px-3 py-8 text-center text-foreground/45">Loading performance data…</td></tr> : null}
            {!loading && !metrics.length ? <tr><td colSpan={8} className="px-3 py-8 text-center text-foreground/45">No AI requests recorded yet.</td></tr> : null}
            {metrics.map((metric) => <tr key={metric.requestId} className="align-top hover:bg-black/[0.02]">
              <td className="whitespace-nowrap px-3 py-3 text-foreground/60">{formatDate(metric.createdAt)}</td>
              <td className="px-3 py-3 font-semibold">{seconds(metric.totalMs)}</td>
              <td className="px-3 py-3">{seconds(metric.llmMs)}</td>
              <td className="px-3 py-3">{seconds(metric.toolMs)}</td>
              <td className="px-3 py-3">{metric.toolCalls}</td>
              <td className="px-3 py-3">{metric.iterations}</td>
              <td className="max-w-48 truncate px-3 py-3 text-foreground/55">{metric.model ?? "Unknown"}</td>
              <td className="px-3 py-3"><div className="space-y-1">{metric.tools.length ? metric.tools.map((tool, index) => <div key={`${metric.requestId}-${index}`} className="flex gap-2 whitespace-nowrap"><span className="font-medium">{tool.name}</span><span className="text-foreground/45">{seconds(tool.durationMs)}</span></div>) : <span className="text-foreground/40">No tools</span>}</div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line/70 bg-black/[0.02] p-3"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/40">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{value}</p></div>;
}
