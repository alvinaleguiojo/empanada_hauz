"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type InstructionKind = "instruction" | "prompt";

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

export default function AiInstructionsPage() {
  const [instructions, setInstructions] = useState<AiInstruction[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadInstructions();
  }, []);

  async function loadInstructions() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<AiInstruction[]>("/ai-instructions");
      setInstructions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI instructions");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: AiInstruction) {
    setEditingId(item._id);
    setForm({
      title: item.title,
      content: item.content,
      kind: item.kind,
      priority: String(item.priority),
      enabled: item.enabled
    });
    setNotice(null);
    setError(null);
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
      content: form.content.trim(),
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
        setInstructions((current) => current.map((item) => (item._id === updated._id ? updated : item)));
        setNotice("AI instruction updated.");
      } else {
        const created = await apiFetch<AiInstruction>("/ai-instructions", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setInstructions((current) => [...current, created]);
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
      setInstructions((current) => current.map((entry) => (entry._id === updated._id ? updated : entry)));
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
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI Instructions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">
          Add behavior, tone, or business-specific instructions that are injected into the Messenger AI at runtime. Core application validation and database truth always take precedence.
        </p>
      </div>

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
              <Input maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: Warm repeat-customer tone" />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Type</span>
              <select
                className="h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-sm text-foreground outline-none focus:border-accent/50"
                value={form.kind}
                onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as InstructionKind }))}
              >
                <option value="instruction">Instruction</option>
                <option value="prompt">Prompt</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Priority</span>
              <Input type="number" min={0} max={9999} step={1} value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} />
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            <span>Instruction content</span>
            <textarea
              maxLength={3000}
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="Example: When explaining pickup, keep the response to one or two short sentences and use a friendly Cebuano tone."
              rows={7}
              className="w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-foreground/30 focus:border-accent/50"
            />
            <span className="text-xs font-normal text-foreground/40">Maximum 3,000 characters.</span>
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
          <p className="mt-1 text-sm text-foreground/50">Only enabled instructions are sent to Messenger AI.</p>
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
                    <Badge>{item.kind}</Badge>
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
    </main>
  );
}
