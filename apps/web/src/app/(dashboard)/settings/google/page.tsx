"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Cloud, ExternalLink, Unplug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";

type GoogleStatus = { connected: boolean; email: string | null; calendarId: string; driveFolderId: string | null };

export default function GoogleWorkspaceSettingsPage() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setStatus(await apiFetch<GoogleStatus>("/google-workspace/status")); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load Google Workspace status."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function connect() {
    window.location.href = `${API_URL}/google-workspace/oauth/start`;
  }

  async function disconnect() {
    setBusy(true); setError(null);
    try { await apiFetch("/google-workspace/connection", { method: "DELETE" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to disconnect Google Workspace."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8 lg:px-8">
      <div className="mb-8"><Link href="/settings" className="text-sm text-accent">← Settings</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight">Google Workspace</h1><p className="mt-2 text-sm leading-6 text-foreground/60">Connect Google Calendar and Drive so scheduled orders can be synchronized with your business calendar.</p></div>
      <Card className="p-6">
        {loading ? <p className="text-sm text-foreground/50">Checking connection…</p> : status?.connected ? <>
          <div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08]"><CalendarDays className="h-5 w-5 text-emerald-500" /></div><div className="min-w-0 flex-1"><h2 className="font-semibold">Google connected</h2><p className="mt-1 text-sm text-foreground/55">{status.email}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.08] p-4"><p className="text-xs uppercase tracking-[0.16em] text-foreground/40">Calendar</p><p className="mt-2 text-sm font-medium">{status.calendarId}</p></div><div className="rounded-xl border border-white/[0.08] p-4"><p className="text-xs uppercase tracking-[0.16em] text-foreground/40">Drive folder</p><p className="mt-2 break-all text-sm font-medium">{status.driveFolderId ?? "Configured by environment"}</p></div></div><button type="button" onClick={() => void disconnect()} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/[0.1] px-4 py-2.5 text-sm font-semibold"> <Unplug className="h-4 w-4" />{busy ? "Disconnecting…" : "Disconnect Google"}</button></div></div>
        </> : <div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]"><Cloud className="h-5 w-5 text-accent" /></div><div className="flex-1"><h2 className="font-semibold">Connect Google Calendar + Drive</h2><p className="mt-1 text-sm leading-6 text-foreground/55">Empanada Hauz requests permission to create and update calendar events and manage files created by this application in Google Drive.</p><button type="button" onClick={connect} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">Connect Google <ExternalLink className="h-4 w-4" /></button></div></div>}
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </Card>
      <Card className="mt-5 p-5"><p className="text-sm leading-6 text-foreground/55">After connecting, use the Calendar sync action on an order with a preferred schedule. Google Calendar events are tagged with the Empanada Hauz order ID so updates remain idempotent without adding another event record to MongoDB.</p></Card>
    </main>
  );
}
