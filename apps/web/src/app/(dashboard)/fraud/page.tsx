"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bike, CheckCircle2, Plus, Search, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";

type EntityType = "customer" | "rider";
type Status = "open" | "reviewed" | "cleared";
type Severity = "low" | "medium" | "high" | "critical";

type FraudCase = {
  _id: string;
  entityType: EntityType;
  status: Status;
  severity: Severity;
  name?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  plateNumber?: string | null;
  messengerPsid?: string | null;
  address?: string | null;
  subjectId?: string | null;
  reason: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type FraudLog = {
  _id: string;
  entityType: EntityType;
  caseId: string;
  orderId?: string | null;
  deliveryJobId?: string | null;
  riderId?: string | null;
  matchedOn: string[];
  score: number;
  severity: Severity;
  createdAt: string;
};

type Stats = { openCustomers: number; openRiders: number; critical: number; recentMatches: number };

const severityClasses: Record<Severity, string> = {
  low: "bg-white/[0.05] text-foreground/60",
  medium: "bg-amber-500/10 text-amber-500",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500"
};

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function FraudPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [tab, setTab] = useState<EntityType>("customer");
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [logs, setLogs] = useState<FraudLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ severity: "high" as Severity, name: "", phoneNumber: "", email: "", plateNumber: "", messengerPsid: "", address: "", subjectId: "", reason: "", notes: "" });

  const canManage = role ? hasPermission(role, "fraud.manage") : false;
  const filteredCases = useMemo(() => {
    const query = normalizeSearch(search);
    return cases.filter((item) => {
      if (item.entityType !== tab) return false;
      if (!query) return true;
      return [item.name, item.phoneNumber, item.email, item.plateNumber, item.messengerPsid, item.address, item.subjectId, item.reason, item.notes]
        .filter(Boolean)
        .some((value) => normalizeSearch(String(value)).includes(query));
    });
  }, [cases, search, tab]);

  async function load() {
    setLoading(true);
    try {
      const [nextCases, nextLogs, nextStats] = await Promise.all([
        apiFetch<FraudCase[]>("/fraud/cases"),
        apiFetch<FraudLog[]>("/fraud/logs?limit=100"),
        apiFetch<Stats>("/fraud/stats")
      ]);
      setCases(nextCases);
      setLogs(nextLogs);
      setStats(nextStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load fraud center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRole(decodeRole(window.localStorage.getItem("empanada-token")));
    void load();
  }, []);

  async function createCase() {
    try {
      await apiFetch("/fraud/cases", { method: "POST", body: JSON.stringify({ entityType: tab, ...form }) });
      setShowForm(false);
      setNotice(`${tab === "customer" ? "Customer" : "Rider"} risk case logged.`);
      setForm({ severity: "high", name: "", phoneNumber: "", email: "", plateNumber: "", messengerPsid: "", address: "", subjectId: "", reason: "", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create case.");
    }
  }

  async function updateCase(id: string, patch: Partial<Pick<FraudCase, "status" | "severity">>) {
    try {
      await apiFetch(`/fraud/cases/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update case.");
    }
  }

  async function deleteCase(id: string) {
    if (!window.confirm("Delete this fraud case? Existing detection logs will remain.")) return;
    try {
      await apiFetch(`/fraud/cases/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete case.");
    }
  }

  if (role && !hasPermission(role, "fraud.view")) {
    return <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8"><Card className="p-8"><h1 className="text-xl font-semibold">Fraud Center</h1><p className="mt-2 text-sm text-foreground/55">Your role does not have access to fraud detection.</p></Card></main>;
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Risk & Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Fraud Center</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">Log known-risk customers and riders. New orders and rider assignments are checked automatically against open cases.</p></div>
        {canManage ? <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"><Plus className="h-4 w-4" /> Log risk case</button> : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-[0.18em] text-foreground/45">Open customers</p><p className="mt-2 text-3xl font-semibold">{stats?.openCustomers ?? "—"}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-[0.18em] text-foreground/45">Open riders</p><p className="mt-2 text-3xl font-semibold">{stats?.openRiders ?? "—"}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-[0.18em] text-foreground/45">Critical cases</p><p className="mt-2 text-3xl font-semibold">{stats?.critical ?? "—"}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-[0.18em] text-foreground/45">Recent matches</p><p className="mt-2 text-3xl font-semibold">{stats?.recentMatches ?? "—"}</p></Card>
      </div>

      {notice ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}
      {error ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500"><AlertTriangle className="h-4 w-4" />{error}</div> : null}

      <div className="mt-6 flex gap-2 border-b border-white/[0.08]">
        <button type="button" onClick={() => { setTab("customer"); setSearch(""); }} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === "customer" ? "border-accent text-accent" : "border-transparent text-foreground/50"}`}><UserRound className="mr-2 inline h-4 w-4" />Customers</button>
        <button type="button" onClick={() => { setTab("rider"); setSearch(""); }} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === "rider" ? "border-accent text-accent" : "border-transparent text-foreground/50"}`}><Bike className="mr-2 inline h-4 w-4" />Riders</button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.08] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-accent" /><h2 className="font-semibold">{tab === "customer" ? "Customer risk cases" : "Rider risk cases"}</h2></div>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "customer" ? "Search name, phone, address…" : "Search name, phone, plate…"} aria-label={`Search ${tab} fraud cases`} className="w-full rounded-xl border border-white/[0.1] bg-background py-2.5 pl-9 pr-8 text-sm outline-none placeholder:text-foreground/35 focus:border-accent" />
                {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs text-foreground/45 hover:bg-white/[0.06] hover:text-foreground">×</button> : null}
              </div>
            </div>
            {search ? <p className="mt-2 text-xs text-foreground/40">{filteredCases.length} matching {tab} case{filteredCases.length === 1 ? "" : "s"}</p> : null}
          </div>
          <div className="divide-y divide-white/[0.06]">
            {loading ? <div className="p-8 text-sm text-foreground/50">Loading…</div> : filteredCases.length === 0 ? <div className="p-8 text-sm text-foreground/50">{search ? `No ${tab} fraud cases match “${search}”.` : `No open or historical ${tab} risk cases yet.`}</div> : filteredCases.map((item) => <div key={item._id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.name || item.subjectId || "Unnamed"}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${severityClasses[item.severity]}`}>{item.severity}</span><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] uppercase text-foreground/55">{item.status}</span></div><p className="mt-2 text-sm text-foreground/60">{item.reason}</p></div>{canManage ? <button type="button" onClick={() => void deleteCase(item._id)} className="rounded-lg p-2 text-foreground/40 hover:bg-red-500/10 hover:text-red-500"><Trash2 className="h-4 w-4" /></button> : null}</div>
              <div className="mt-3 grid gap-2 text-xs text-foreground/50 sm:grid-cols-2">{item.phoneNumber ? <span>Phone: {item.phoneNumber}</span> : null}{item.email ? <span>Email: {item.email}</span> : null}{item.plateNumber ? <span>Plate: {item.plateNumber}</span> : null}{item.messengerPsid ? <span>Messenger: {item.messengerPsid}</span> : null}{item.subjectId ? <span>ID: {item.subjectId}</span> : null}{item.address ? <span className="sm:col-span-2">Address: {item.address}</span> : null}</div>
              {canManage ? <div className="mt-4 flex flex-wrap gap-2"><select value={item.severity} onChange={(event) => void updateCase(item._id, { severity: event.target.value as Severity })} className="rounded-lg border border-white/[0.1] bg-background px-2.5 py-2 text-xs"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select><select value={item.status} onChange={(event) => void updateCase(item._id, { status: event.target.value as Status })} className="rounded-lg border border-white/[0.1] bg-background px-2.5 py-2 text-xs"><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="cleared">Cleared</option></select></div> : null}
            </div>)}
          </div>
        </Card>

        <Card className="overflow-hidden"><div className="border-b border-white/[0.08] px-5 py-4"><h2 className="font-semibold">Detection log</h2><p className="mt-1 text-xs text-foreground/45">Automatic matches recorded after order creation or rider assignment.</p></div><div className="divide-y divide-white/[0.06]">{logs.length === 0 ? <div className="p-8 text-sm text-foreground/50">No matches recorded.</div> : logs.map((log) => <div key={log._id} className="p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{log.entityType === "customer" ? "Customer" : "Rider"} match</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${severityClasses[log.severity]}`}>{log.score}%</span></div><p className="mt-1 text-xs text-foreground/50">Matched: {log.matchedOn.join(", ")}</p><p className="mt-1 text-[11px] text-foreground/35">{new Date(log.createdAt).toLocaleString()}</p></div>)}</div></Card>
      </div>

      {showForm && canManage ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}><Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Log {tab} risk case</h2><p className="mt-1 text-sm text-foreground/50">Use exact identifiers when possible. A match is a risk signal, not an automatic fraud verdict.</p></div><button type="button" onClick={() => setShowForm(false)} className="text-sm text-foreground/45">Close</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-foreground/45">Severity</span><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })} className="w-full rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" />
        <input placeholder="Phone" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" />
        {tab === "rider" ? <><input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" /><input placeholder="Plate number" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" /></> : <input placeholder="Messenger PSID" value={form.messengerPsid} onChange={(e) => setForm({ ...form, messengerPsid: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" />}
        <input placeholder={tab === "rider" ? "Rider user ID (optional)" : "Customer ID (optional)"} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" />
        <input placeholder="Address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm" />
        <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm sm:col-span-2" />
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm sm:col-span-2" />
      </div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-sm">Cancel</button><button type="button" onClick={() => void createCase()} disabled={!form.reason.trim()} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50">Save risk case</button></div></Card></div> : null}
    </main>
  );
}
