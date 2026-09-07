"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type AiAction = {
  name: string;
  label: string;
  enabled: boolean;
  description: string;
  defaultDescription: string;
  risk: "read" | "write";
  requiresCustomerContext: boolean;
  requiresExplicitConfirmation: boolean;
  inputSchema: Record<string, unknown>;
  configured: boolean;
  custom: boolean;
  executor: string;
};

type Executor = {
  name: string;
  description: string;
  risk: "read" | "write";
  requiresCustomerContext: boolean;
  requiresExplicitConfirmation: boolean;
  inputSchema: Record<string, unknown>;
};

type Draft = Pick<AiAction, "label" | "description" | "enabled">;

type NewActionForm = {
  name: string;
  label: string;
  description: string;
  executor: string;
  enabled: boolean;
};

const EMPTY_NEW_ACTION: NewActionForm = { name: "", label: "", description: "", executor: "", enabled: true };

export default function AiActionsPanel() {
  const [actions, setActions] = useState<AiAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [newAction, setNewAction] = useState<NewActionForm>(EMPTY_NEW_ACTION);
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void loadActions(); }, []);

  async function loadActions() {
    setLoading(true);
    setError(null);
    try {
      const [result, availableExecutors] = await Promise.all([
        apiFetch<AiAction[]>("/ai-actions"),
        apiFetch<Executor[]>("/ai-actions/executors")
      ]);
      setActions(result);
      setExecutors(availableExecutors);
      setDrafts(Object.fromEntries(result.map((action) => [action.name, { label: action.label, description: action.description, enabled: action.enabled }])));
      if (!newAction.executor && availableExecutors[0]) setNewAction((current) => ({ ...current, executor: availableExecutors[0].name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI actions");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(name: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [name]: { ...current[name], ...patch } }));
    setNotice(null);
    setError(null);
  }

  async function save(action: AiAction) {
    const draft = drafts[action.name];
    if (!draft) return;
    if (!draft.label.trim()) return setError("Action label cannot be empty.");
    if (!draft.description.trim()) return setError("Action description cannot be empty because it guides semantic tool selection.");
    setSaving(action.name); setError(null); setNotice(null);
    try {
      const updated = await apiFetch<AiAction>(`/ai-actions/${encodeURIComponent(action.name)}`, { method: "PATCH", body: JSON.stringify({ enabled: draft.enabled, label: draft.label.trim(), description: draft.description.trim() }) });
      setActions((current) => current.map((entry) => entry.name === updated.name ? { ...entry, ...updated, configured: true } : entry));
      setDrafts((current) => ({ ...current, [updated.name]: { label: updated.label, description: updated.description, enabled: updated.enabled } }));
      setNotice(`Saved “${updated.label}”.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save AI action"); }
    finally { setSaving(null); }
  }

  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newAction.name.trim();
    const label = newAction.label.trim();
    const description = newAction.description.trim();
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(name)) return setError("Action name must use lowercase letters, numbers, and underscores, starting with a letter.");
    if (!label) return setError("Action label cannot be empty.");
    if (!description) return setError("Action description cannot be empty.");
    if (!newAction.executor) return setError("Choose an approved executor.");
    setCreating(true); setError(null); setNotice(null);
    try {
      const created = await apiFetch<AiAction>("/ai-actions", { method: "POST", body: JSON.stringify({ name, label, description, executor: newAction.executor, enabled: newAction.enabled }) });
      setActions((current) => [...current, { ...created, defaultDescription: executors.find((item) => item.name === created.executor)?.description ?? created.description, configured: true, custom: true }].sort((a, b) => a.name.localeCompare(b.name)));
      setDrafts((current) => ({ ...current, [created.name]: { label: created.label ?? name, description: created.description ?? description, enabled: created.enabled } }));
      setNewAction({ ...EMPTY_NEW_ACTION, executor: newAction.executor });
      setShowBuilder(false);
      setNotice(`Created “${created.label ?? name}”. It is now available to the AI planner.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create AI action"); }
    finally { setCreating(false); }
  }

  async function reset(action: AiAction) {
    const message = action.custom ? `Delete custom action “${action.label}”?` : `Reset “${action.label}” to its built-in defaults?`;
    if (!window.confirm(message)) return;
    setResetting(action.name); setError(null); setNotice(null);
    try {
      await apiFetch<void>(`/ai-actions/${encodeURIComponent(action.name)}`, { method: "DELETE" });
      if (action.custom) {
        setActions((current) => current.filter((entry) => entry.name !== action.name));
        setDrafts((current) => { const next = { ...current }; delete next[action.name]; return next; });
        setNotice(`Deleted “${action.label}”.`);
      } else {
        const updated = { ...action, label: action.name, description: action.defaultDescription, enabled: true, configured: false };
        setActions((current) => current.map((entry) => entry.name === action.name ? updated : entry));
        setDrafts((current) => ({ ...current, [action.name]: { label: updated.label, description: updated.description, enabled: updated.enabled } }));
        setNotice(`Reset “${action.name}” to defaults.`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reset AI action"); }
    finally { setResetting(null); }
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground">{notice}</div> : null}

      <Card className="p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">AI Actions</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/55">Control built-in capabilities and create new semantic actions from approved application executors. No keywords or regex rules are needed.</p>
          </div>
          <Button type="button" onClick={() => { setShowBuilder((current) => !current); setError(null); setNotice(null); }}>
            {showBuilder ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showBuilder ? "Close builder" : "Add action"}
          </Button>
        </div>
      </Card>

      {showBuilder ? (
        <Card className="p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Create an AI action</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/50">Choose a safe executor already provided by the application. Your new action becomes a semantic alias with its own name and description.</p>
          </div>
          <form className="space-y-5" onSubmit={createAction}>
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="space-y-2 text-sm font-medium"><span>Action name</span><Input maxLength={64} value={newAction.name} onChange={(event) => setNewAction((current) => ({ ...current, name: event.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="get_my_recent_orders" /><span className="text-xs font-normal text-foreground/40">Machine name: lowercase letters, numbers, underscores.</span></label>
              <label className="space-y-2 text-sm font-medium"><span>Display label</span><Input maxLength={120} value={newAction.label} onChange={(event) => setNewAction((current) => ({ ...current, label: event.target.value }))} placeholder="My Recent Orders" /></label>
            </div>
            <label className="block space-y-2 text-sm font-medium"><span>Approved executor</span><select value={newAction.executor} onChange={(event) => setNewAction((current) => ({ ...current, executor: event.target.value }))} className="h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-sm text-foreground outline-none focus:border-accent/50">{executors.map((executor) => <option key={executor.name} value={executor.name}>{executor.name} — {executor.risk === "write" ? "write" : "read"}</option>)}</select>{newAction.executor ? <p className="text-xs font-normal text-foreground/40">{executors.find((item) => item.name === newAction.executor)?.description}</p> : null}</label>
            <label className="block space-y-2 text-sm font-medium"><span>AI semantic description</span><textarea maxLength={2000} rows={5} value={newAction.description} onChange={(event) => setNewAction((current) => ({ ...current, description: event.target.value }))} placeholder="Explain what the AI should understand this action can accomplish…" className="w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50" /><span className="text-xs font-normal text-foreground/40">Describe intent semantically. The AI uses this description for tool selection.</span></label>
            <div className="flex flex-wrap items-center justify-between gap-4"><label className="inline-flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={newAction.enabled} onChange={(event) => setNewAction((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-[rgb(var(--accent))]" />Enabled for AI</label><Button type="submit" disabled={creating}>{creating ? "Creating…" : <><Plus className="h-4 w-4" /> Create action</>}</Button></div>
          </form>
        </Card>
      ) : null}

      {loading ? <Card className="p-8 text-sm text-foreground/50">Loading AI actions…</Card> : (
        <div className="space-y-4">
          {actions.map((action) => {
            const draft = drafts[action.name] ?? { label: action.label, description: action.description, enabled: action.enabled };
            return <Card key={action.name} className="p-5 lg:p-6"><div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{draft.label}</h2><Badge>{action.name}</Badge><Badge>{action.custom ? "Custom action" : "Built-in"}</Badge><Badge>{action.risk === "write" ? "Write" : "Read"}</Badge>{action.requiresExplicitConfirmation ? <Badge>Confirmation required</Badge> : null>{action.configured && !action.custom ? <Badge>Customized</Badge> : null}</div><p className="mt-2 text-sm leading-6 text-foreground/50">Executor: <span className="font-medium text-foreground/70">{action.executor}</span>. {action.requiresCustomerContext ? "Customer context required. " : ""}{action.requiresExplicitConfirmation ? "Customer confirmation is enforced by the application. " : ""}The executor and validation rules remain application-controlled.</p></div>
                <label className="inline-flex shrink-0 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft(action.name, { enabled: event.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />Enabled for AI</label>
              </div>
              <div className="grid gap-5"><label className="space-y-2 text-sm font-medium"><span>Display label</span><Input maxLength={120} value={draft.label} onChange={(event) => updateDraft(action.name, { label: event.target.value })} /></label><label className="space-y-2 text-sm font-medium"><span>AI semantic description</span><textarea maxLength={2000} rows={5} value={draft.description} onChange={(event) => updateDraft(action.name, { description: event.target.value })} className="w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50" /><span className="text-xs font-normal text-foreground/40">This text is supplied to the AI planner as the meaning/capability of the action.</span></label></div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4"><p className="text-xs text-foreground/40">Changes take effect on the next AI request.</p><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" type="button" disabled={resetting === action.name} onClick={() => void reset(action)}>{action.custom ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{resetting === action.name ? "Working…" : action.custom ? "Delete action" : "Reset"}</Button><Button size="sm" type="button" disabled={saving === action.name} onClick={() => void save(action)}><Save className="h-4 w-4" />{saving === action.name ? "Saving…" : "Save action"}</Button></div></div>
            </div></Card>;
          })}
        </div>
      )}
    </div>
  );
}
