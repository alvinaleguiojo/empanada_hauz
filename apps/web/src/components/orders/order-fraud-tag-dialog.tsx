"use client";

import { useState } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OrderFraudTagDialog({ order, onClose, onSuccess }: { order: any; onClose: () => void; onSuccess: () => void }) {
  const [severity, setSeverity] = useState<"medium" | "high" | "critical">("high");
  const [reason, setReason] = useState("Suspected fraudulent customer based on order history.");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/fraud/cases", {
        method: "POST",
        body: JSON.stringify({
          entityType: "customer",
          severity,
          subjectId: order.customer?.id || undefined,
          name: order.customer?.name || undefined,
          phoneNumber: order.customer?.phoneNumber || undefined,
          messengerPsid: order.customer?.messengerPsid || undefined,
          address: order.address || order.location || order.customer?.defaultAddress || undefined,
          reason: reason.trim(),
          notes: notes.trim() || undefined
        })
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to tag customer as fraud.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between border-b border-line/70 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-red-500"><ShieldAlert size={18} /><span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Fraud Tag</span></div>
            <h3 className="mt-1 text-xl font-semibold">Tag {order.customer?.name || "Customer"}</h3>
            <p className="mt-1 text-xs text-foreground/45">This creates an open customer risk case used by the backend fraud checks.</p>
          </div>
          <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={onClose}><X size={18} /></Button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-2 rounded-lg border border-line/70 bg-black/[0.04] p-3 text-sm">
            <div><span className="text-foreground/45">Customer:</span> {order.customer?.name || "Unknown"}</div>
            <div><span className="text-foreground/45">Phone:</span> {order.customer?.phoneNumber || "—"}</div>
            <div><span className="text-foreground/45">Address:</span> {order.address || order.location || order.customer?.defaultAddress || "—"}</div>
          </div>

          <label className="block text-sm font-medium">Severity
            <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} className="mt-1.5 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent">
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label className="block text-sm font-medium">Reason
            <Input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5" placeholder="Why is this customer being tagged?" />
          </label>

          <label className="block text-sm font-medium">Internal notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes for the team" className="mt-1.5 min-h-24 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
          </label>

          {error ? <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-500"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line/70 p-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="gap-2 bg-red-600 text-white hover:bg-red-700" onClick={() => void submit()} disabled={saving || !reason.trim()}>
            <ShieldAlert size={15} />
            {saving ? "Tagging..." : "Tag Customer as Fraud"}
          </Button>
        </div>
      </div>
    </div>
  );
}
