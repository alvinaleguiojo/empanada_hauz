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
  inputSchema: Record<string, unknown>;
  configured: boolean;
};

type Draft = Pick<AiAction, "label" | "description" | "enabled">;

export default function AiActionsPage() {
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
      setDrafts(Object.fromEntries(result.map((action) => [action.name, {
        label: action.label,
        description: action.description,
        enabled: action.enabled
      }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI actions");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(name: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [name]: { ...current[name], ...patch } }));
    setNotice(null);
  }

  async function save(action: AiAction) {
    const draft = drafts[action.name];
    if (!draft) return;
    if (!draft.label.trim()) {
      setError("Action label cannot be empty.");
      return;
    }
    if (!draft.description.trim()) {
      setError("Action description cannot be empty because it guides the AI's semantic tool selection.");
      return;
    }

    setSaving(action.name);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<AiAction>(`/ai-actions/${encodeURIComponent(action.name)}`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: draft.enabled,
          label: draft.label.trim(),
          description: draft.description.trim()
        })
      });
      setActions((current) => current.map((entry) => entry.name === updated.name ? { ...entry, ...updated, configured: true } : entry));
      setDrafts((current) => ({ ...current, [updated.name]: { label: updated.label, description: updated.description, enabled: updated.enabled } }));
      setNotice(`Saved “${updated.label}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save AI action");
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
      setActions((current) => current.map((entry) => entry.name === action.name ? updated : entry));
      setDrafts((current) => ({ ...current, [action.name]: { label: updated.label, description: updated.description, enabled: updated.enabled } }));
      setNotice(`Reset “${action.name}” to defaults.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset AI action");
    } finally {
      setResetting(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI Actions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">
          Control which application actions the AI can use and tune how each capability is described to the semantic planner. These are runtime settings; no source-code keyword rules are required.
        </p>
      </div>

      {error ? <div className="mb-5 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="mb-5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground">{notice}</div> : null}

      {loading ? (
        <Card className="p-8 text-sm text-foreground/50">Loading AI actions…</Card>
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
                        <Badge>{action.risk === "write" ? "Write action" : "Read action"}</Badge>
                        {action.requiresExplicitConfirmation ? <Badge>Confirmation required</Badge> : null}
                        {action.configured ? <Badge>Customized</Badge> : <Badge className="opacity-60">Default</Badge>}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground/50">
                        {action.requiresCustomerContext ? "Customer context required. " : ""}
                        {action.requiresExplicitConfirmation ? "Customer confirmation is enforced by the application. " : ""}
                        The executor and validation rules stay application-controlled.
                      </p>
                    </div>
                    <label className="inline-flex shrink-0 items-center gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) => updateDraft(action.name, { enabled: event.target.checked })}
                        className="h-4 w-4 accent-[rgb(var(--accent))]"
                      />
                      Enabled for AI
                    </label>
                  </div>

                  <div className="grid gap-5">
                    <label className="space-y-2 text-sm font-medium">
                      <span>Display label</span>
                      <Input
                        maxLength={120}
                        value={draft.label}
                        onChange={(event) => updateDraft(action.name, { label: event.target.value })}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      <span>AI semantic description</span>
                      <textarea
                        maxLength={2000}
                        rows={5}
                        value={draft.description}
                        onChange={(event) => updateDraft(action.name, { description: event.target.value })}
                        className="w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50"
                      />
                      <span className="text-xs font-normal text-foreground/40">This text is supplied to the AI planner as the meaning/capability of the action. Maximum 2,000 characters.</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
                    <p className="text-xs text-foreground/40">Changes take effect on the next AI request.</p>
                    <div className="flex flex-wrap gap-2">
                      {action.configured ? (
                        <Button variant="ghost" size="sm" type="button" disabled={resetting === action.name} onClick={() => void reset(action)}>
                          <RotateCcw className="h-4 w-4" />
                          {resetting === action.name ? "Resetting…" : "Reset"}
                        </Button>
                      ) : null}
                      <Button size="sm" type="button" disabled={saving === action.name} onClick={() => void save(action)}>
                        <Save className="h-4 w-4" />
                        {saving === action.name ? "Saving…" : "Save action"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
