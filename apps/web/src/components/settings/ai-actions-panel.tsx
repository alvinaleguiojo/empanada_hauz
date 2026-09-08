"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
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
  configured: boolean;
};

type Draft = Pick<AiAction, "label" | "description" | "enabled">;

export default function AiActionsPanel() {
  const [actions, setActions] = useState<AiAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadActions();
  }, []);

  async function loadActions() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<AiAction[]>("/ai-actions");
      setActions(result);
      setDrafts(
        Object.fromEntries(
          result.map((action) => [action.name, { label: action.label, description: action.description, enabled: action.enabled }])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI tools");
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
    if (!draft.label.trim()) return setError("Tool label cannot be empty.");
    if (!draft.description.trim()) return setError("Tool description cannot be empty because it guides semantic tool selection.");

    setSaving(action.name);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<AiAction>(`/ai-actions/${encodeURIComponent(action.name)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: draft.enabled, label: draft.label.trim(), description: draft.description.trim() })
      });
      setActions((current) => current.map((entry) => (entry.name === updated.name ? { ...entry, ...updated, configured: true } : entry)));
      setDrafts((current) => ({ ...current, [updated.name]: { label: updated.label, description: updated.description, enabled: updated.enabled } }));
      setNotice(`Saved “${updated.label}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save AI tool");
    } finally {
      setSaving(null);
    }
  }

  async function reset(action: AiAction) {
    if (!window.confirm(`Reset “${action.label}” to its built-in defaults?`)) return;
    setResetting(action.name);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<void>(`/ai-actions/${encodeURIComponent(action.name)}`, { method: "DELETE" });
      const updated = { ...action, label: action.name, description: action.defaultDescription, enabled: true, configured: false };
      setActions((current) => current.map((entry) => (entry.name === action.name ? updated : entry)));
      setDrafts((current) => ({ ...current, [action.name]: { label: updated.label, description: updated.description, enabled: updated.enabled } }));
      setNotice(`Reset “${action.name}” to its built-in defaults.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset AI tool");
    } finally {
      setResetting(null);
    }
  }

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground">{notice}</div> : null}

      <Card className="p-5 lg:p-6">
        <div>
          <h2 className="text-lg font-semibold">AI Tools</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/55">
            These are the fixed application capabilities the AI is allowed to use. Security, input schemas, permissions, confirmation rules, and execution remain controlled by the application. You can enable or disable a tool and tune the semantic description used by the AI planner.
          </p>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-sm text-foreground/50">Loading AI tools…</Card>
      ) : actions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-semibold">No AI tools are available.</p>
          <p className="mt-1 text-sm text-foreground/50">Built-in AI capabilities are registered by the application.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {actions.map((action) => {
            const draft = drafts[action.name] ?? { label: action.label, description: action.description, enabled: action.enabled };
            return (
              <Card key={action.name} className="p-5 lg:p-6">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{draft.label}</h2>
                        <Badge>{action.name}</Badge>
                        <Badge>{action.risk === "write" ? "Write" : "Read"}</Badge>
                        {action.requiresExplicitConfirmation ? <Badge>Confirmation required</Badge> : null}
                        {action.configured ? <Badge>Customized</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground/50">
                        {action.requiresCustomerContext ? "Customer context required. " : ""}
                        {action.requiresExplicitConfirmation ? "Customer confirmation is enforced by the application. " : ""}
                        Tool execution and validation are application-controlled.
                      </p>
                    </div>
                    <label className="inline-flex shrink-0 items-center gap-3 text-sm font-medium">
                      <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft(action.name, { enabled: event.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                      Enabled for AI
                    </label>
                  </div>

                  <div className="grid gap-5">
                    <label className="space-y-2 text-sm font-medium">
                      <span>Display label</span>
                      <Input maxLength={120} value={draft.label} onChange={(event) => updateDraft(action.name, { label: event.target.value })} />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      <span>AI semantic description</span>
                      <textarea maxLength={2000} rows={5} value={draft.description} onChange={(event) => updateDraft(action.name, { description: event.target.value })} className="w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50" />
                      <span className="text-xs font-normal text-foreground/40">Describe the customer intent this tool should satisfy. Do not add keyword or regex routing rules.</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
                    <p className="text-xs text-foreground/40">Changes take effect on the next AI request.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" type="button" disabled={resetting === action.name} onClick={() => void reset(action)}>
                        <RotateCcw className="h-4 w-4" />
                        {resetting === action.name ? "Resetting…" : "Reset"}
                      </Button>
                      <Button size="sm" type="button" disabled={saving === action.name} onClick={() => void save(action)}>
                        <Save className="h-4 w-4" />
                        {saving === action.name ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
