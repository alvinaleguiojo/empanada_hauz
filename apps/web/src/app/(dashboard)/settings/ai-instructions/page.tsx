"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import AiActionsPanel from "@/components/settings/ai-actions-panel";
import AiGlobalSwitch from "@/components/settings/ai-global-switch";

type InstructionKind = "instruction" | "prompt";
type SettingsTab = "instructions" | "actions";

type AiInstruction = {
  _id: string;
  title: string;
  content: string;
  kind: InstructionKind;
  enabled: boolean;
  priority: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  title: string;
  content: string;
  kind: InstructionKind;
  priority: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  kind: "instruction",
  priority: "100",
  enabled: true
};

function getTabFromUrl(): SettingsTab {
  if (typeof window === "undefined") return "instructions";
  return new URLSearchParams(window.location.search).get("tab") === "actions" ? "actions" : "instructions";
}

function normalizeInstructionBullets(content: string): string {
  return content.replace(/^(\s*)[*-](?=\s+)/gm, "$1•");
}

export default function AiInstructionsPage() {
  const [tab, setTab] = useState<SettingsTab>("instructions");
  const [instructions, setInstructions] = useState<AiInstruction[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setTab(getTabFromUrl());
    void loadInstructions();
  }, []);

  function selectTab(nextTab: SettingsTab) {
    setTab(nextTab);
    setError(null);
    setNotice(null);
    const url = new URL(window.location.href);
    if (nextTab === "actions") url.searchParams.set("tab", "actions");
    else url.searchParams.delete("tab");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  async function loadInstructions() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<AiInstruction[]>("/ai-instructions");
      setInstructions(result.map((item) => ({ ...item, content: normalizeInstructionBullets(item.content) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI instructions");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: AiInstruction) {
    selectTab("instructions");
    setEditingId(item._id);
    setForm({
      title: item.title,
      content: normalizeInstructionBullets(item.content),
      kind: item.kind,
      priority: String(item.priority),
      enabled: item.enabled
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      title: form.title.trim(),
      content: normalizeInstructionBullets(form.content.trim()),
      kind: form.kind,
      priority: Number(form.priority),
      enabled: form.enabled
    };

    try {
      if (!payload.title || !payload.content) {
        throw new Error("Title and instruction content are required.");
      }
      if (!Number.isInteger(payload.priority) || payload.priority < 0) {
        throw new Error("Priority must be a whole number greater than or equal to 0.");
      }

      if (editingId) {
        const updated = await apiFetch<AiInstruction>(`/ai-instructions/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        const normalizedUpdated = { ...updated, content: normalizeInstructionBullets(updated.content) };
        setInstructions((current) => current.map((item) => (item._id === normalizedUpdated._id ? normalizedUpdated : item)));
        setNotice("AI instruction updated.");
      } else {
        const created = await apiFetch<AiInstruction>("/ai-instructions", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const normalizedCreated = { ...created, content: normalizeInstructionBullets(created.content) };
        setInstructions((current) => [...current, normalizedCreated]);
        setNotice("AI instruction added.");
      }

      resetForm();
      await loadInstructions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save AI instruction");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: AiInstruction) {
    setError(null);
    try {
      const updated = await apiFetch<AiInstruction>(`/ai-instructions/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !item.enabled })
      });
      const normalizedUpdated = { ...updated, content: normalizeInstructionBullets(updated.content) };
      setInstructions((current) => current.map((entry) => (entry._id === normalizedUpdated._id ? normalizedUpdated : entry)));
      setNotice(updated.enabled ? `Enabled “${updated.title}”.` : `Disabled “${updated.title}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change instruction status");
    }
  }

  async function remove(item: AiInstruction) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;

    setError(null);
    try {
      await apiFetch<void>(`/ai-instructions/${item._id}`, { method: "DELETE" });
      setInstructions((current) => current.filter((entry) => entry._id !== item._id));
      if (editingId === item._id) resetForm();
      setNotice(`Deleted “${item.title}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete AI instruction");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-medium text-foreground/55 transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin Settings</p>
          <div className="mt-2 flex items-center gap-3">
            <Bot className="h-7 w-7 text-accent" />
            <h1 className="text-3xl font-semibold tracking-tight">AI Configuration</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">
            Manage the AI's runtime instructions and application capabilities from one place. Keep customer wording semantic rather than maintaining keyword rules.
          </p>
        </div>
      </div>

      <AiGlobalSwitch />

      <div className="mb-6 border-b border-white/[0.08]">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="AI configuration tabs">
          <button type="button" role="tab" aria-selected={tab === "instructions"} onClick={() => selectTab("instructions")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "instructions" ? "border-accent text-foreground" : "border-transparent text-foreground/50 hover:text-foreground"}`}>
            AI Instructions
          </button>
          <button type="button" role="tab" aria-selected={tab === "actions"} onClick={() => selectTab("actions")} className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === "actions" ? "border-accent text-foreground" : "border-transparent text-foreground/50 hover:text-foreground"}`}>
            AI Actions
          </button>
        </div>
      </div>

      {tab === "actions" ? (
        <AiActionsPanel />
      ) : (
        <>
          {error ? <div className="mb-5 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
          {notice ? <div className="mb-5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground">{notice}</div> : null}

          <Card className="mb-8 p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{editingId ? "Edit instruction" : "Add instruction"}</h2>
                <p className="mt-1 text-sm text-foreground/55">Use semantic behavior rules instead of matching exact customer phrases.</p>
              </div>
              {editingId ? (
                <Button variant="ghost" size="sm" type="button" onClick={resetForm}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
            </div>

            <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr_0.6fr]">
                <label className="space-y-2 text-sm font-medium">
                  <span>Title</span>
                  <Input maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: Friendly customer-facing tone" />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>Type</span>
                  <select className="h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-sm text-foreground outline-none focus:border-accent/50" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as InstructionKind }))}>
                    <option value="instruction">Instruction — AI behavior</option>
                    <option value="prompt">Prompt — customer reply</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>Priority</span>
                  <Input type="number" min={0} max={9999} step={1} value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} />
                </label>
              </div>

              <label className="block space-y-2 text-sm font-medium">
                <div className="flex items-center justify-between gap-3">
                  <span>Content</span>
                  <span className="text-xs font-normal text-foreground/40">{form.content.length.toLocaleString()} / 30,000</span>
                </div>
                <textarea
                  maxLength={30000}
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: normalizeInstructionBullets(event.target.value) }))}
                  placeholder="Instruction: Tell the AI how to interpret order messages. Prompt: Tell the AI how customer-facing replies should sound."
                  rows={18}
                  className="w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50"
                />
                <span className="text-xs font-normal text-foreground/40">Use • for list bullets. Maximum 30,000 characters.</span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <label className="inline-flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                  Enabled
                </label>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingId ? <><Save className="h-4 w-4" /> Save changes</> : <><Plus className="h-4 w-4" /> Add instruction</>}
                </Button>
              </div>
            </form>
          </Card>

          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Configured instructions</h2>
              <p className="mt-1 text-sm text-foreground/50">Only enabled entries are sent to the relevant AI stage.</p>
            </div>
            <Badge>{instructions.length} total</Badge>
          </div>

          {loading ? (
            <Card className="p-8 text-sm text-foreground/50">Loading AI instructions…</Card>
          ) : instructions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="font-semibold">No custom instructions yet.</p>
              <p className="mt-1 text-sm text-foreground/50">Add the first instruction above to start tuning Messenger AI behavior.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {instructions.map((item) => (
                <Card key={item._id} className="p-5 lg:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{item.title}</h3>
                        <Badge>{item.kind === "instruction" ? "AI behavior" : "Customer reply"}</Badge>
                        <Badge className={item.enabled ? "border-accent/20 bg-accent/10" : "opacity-60"}>{item.enabled ? "Enabled" : "Disabled"}</Badge>
                        <Badge>Priority {item.priority}</Badge>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/65">{item.content}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button variant="secondary" size="sm" type="button" onClick={() => void toggleEnabled(item)}>{item.enabled ? "Disable" : "Enable"}</Button>
                      <Button variant="ghost" size="sm" type="button" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /> Edit</Button>
                      <Button variant="danger" size="sm" type="button" onClick={() => void remove(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
