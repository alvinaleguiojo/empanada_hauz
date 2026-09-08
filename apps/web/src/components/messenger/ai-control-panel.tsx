"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Conversation = {
  customer: { id: string; name: string; messengerPsid?: string | null };
};

type CustomerState = {
  globalEnabled: boolean;
  customerOverride: boolean | null;
  effectiveEnabled: boolean;
};

export function AiControlPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerState, setCustomerState] = useState<CustomerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const customers = useMemo(() => {
    const map = new Map<string, Conversation["customer"]>();
    for (const conversation of conversations) {
      if (conversation.customer?.id) map.set(conversation.customer.id, conversation.customer);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(false), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerState(null);
      return;
    }
    void loadCustomerState(selectedCustomerId);
  }, [selectedCustomerId]);

  async function load(showLoader = true) {
    if (showLoader) setLoading(true);
    setError("");
    try {
      const conversationData = await apiFetch<Conversation[]>("/messenger/conversations");
      setConversations(conversationData);
      setSelectedCustomerId((current) => current && conversationData.some((item) => item.customer?.id === current) ? current : conversationData[0]?.customer?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI customer controls.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function loadCustomerState(customerId: string) {
    try {
      const state = await apiFetch<CustomerState>(`/messenger/ai/customers/${customerId}`);
      setCustomerState(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customer AI state.");
    }
  }

  async function saveCustomer(enabled: boolean | null) {
    if (!selectedCustomerId) return;
    setSaving(true); setError("");
    const previous = customerState;
    setCustomerState((current) => current ? { ...current, customerOverride: enabled, effectiveEnabled: enabled ?? current.globalEnabled } : current);
    try {
      const state = await apiFetch<CustomerState>(`/messenger/ai/customers/${selectedCustomerId}`, { method: "PUT", body: JSON.stringify({ enabled }) });
      setCustomerState(state);
    } catch (err) {
      setCustomerState(previous);
      setError(err instanceof Error ? err.message : "Unable to update customer AI switch.");
    } finally { setSaving(false); }
  }

  const customerMode = customerState?.customerOverride === null ? "global" : customerState?.customerOverride ? "on" : "off";

  return (
    <Card className="border-line/80 bg-background/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><UserRound size={19} /></span>
          <div>
            <h2 className="text-sm font-semibold">Customer AI Control</h2>
            <p className="mt-1 text-xs text-foreground/50">Take manual AI control of a specific Messenger customer or return them to the global setting.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
          <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} disabled={loading || !customers.length} className="h-8 min-w-[180px] rounded-lg border-0 bg-transparent px-1 text-xs font-medium outline-none">
            {!customers.length ? <option value="">No customers</option> : customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant={customerMode === "global" ? "default" : "outline"} disabled={saving || !selectedCustomerId} onClick={() => void saveCustomer(null)} className="h-8 px-2.5">Global</Button>
            <Button type="button" size="sm" variant={customerMode === "on" ? "default" : "outline"} disabled={saving || !selectedCustomerId} onClick={() => void saveCustomer(true)} className="h-8 px-2.5">ON</Button>
            <Button type="button" size="sm" variant={customerMode === "off" ? "default" : "outline"} disabled={saving || !selectedCustomerId} onClick={() => void saveCustomer(false)} className="h-8 px-2.5">OFF</Button>
          </div>
        </div>
      </div>

      {selectedCustomer && customerState ? <p className="mt-3 text-[11px] text-foreground/50"><span className="font-semibold text-foreground/70">{selectedCustomer.name}:</span> AI is <span className="font-semibold text-foreground/70">{customerState.effectiveEnabled ? "ON" : "OFF"}</span> {customerState.customerOverride === null ? "(following global setting)" : "(customer override)"}.</p> : null}
      {saving ? <p className="mt-3 flex items-center gap-2 text-xs text-foreground/45"><Loader2 size={13} className="animate-spin" /> Saving AI control...</p> : null}
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}
