"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bot, Cloud, KeyRound, Package, Save, ShieldAlert, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";

type SettingsSection = { href: Route; title: string; description: string; icon: typeof Users; permission: string };
const sections: SettingsSection[] = [
  { href: "/settings/users", title: "Users", description: "Create staff accounts, change roles, reset passwords, and remove access.", icon: Users, permission: "users.manage" },
  { href: "/settings/roles", title: "Roles & Permissions", description: "Review the permissions granted to Admin, Operations, Kitchen, Dispatcher, and Rider roles.", icon: ShieldCheck, permission: "roles.manage" },
  { href: "/settings/products", title: "Products", description: "Add, edit, delete, price, and enable or disable products across the app.", icon: Package, permission: "products.manage" },
  { href: "/settings/google", title: "Google Workspace", description: "Connect Google Calendar and Drive to synchronize scheduled orders and manage application files.", icon: Cloud, permission: "settings.view" },
  { href: "/settings/ai-instructions", title: "AI Instructions", description: "Configure runtime instructions, customer-facing AI behavior, and AI actions.", icon: Bot, permission: "ai-instructions.manage" },
  { href: "/settings/ai-agent", title: "Admin AI Agent", description: "Chat with an AI operator that can analyze live business data and use approved application tools.", icon: Sparkles, permission: "ai-instructions.manage" },
  { href: "/fraud", title: "Fraud Center", description: "Log known-risk customers and riders and review automatic order and rider assignment matches.", icon: ShieldAlert, permission: "fraud.view" }
];

type AiModelSettings = { provider: "ollama" | "gemini" | "groq" | "openai" | "openrouter"; model: string };
const aiModelOptions = [
  { value: "ollama:qwen3:4b-instruct", label: "Qwen3 4B Instruct (Ollama)", provider: "ollama" as const, model: "qwen3:4b-instruct" },
  { value: "gemini:gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "gemini" as const, model: "gemini-3.8-flash" },
  { value: "gemini:gemini-3.7-flash", label: "Gemini 3.7 Flash", provider: "gemini" as const, model: "gemini-3.7-flash" },
  { value: "gemini:gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "gemini" as const, model: "gemini-3.6-flash" },
  { value: "gemini:gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "gemini" as const, model: "gemini-3.5-flash" },
  { value: "gemini:gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" as const, model: "gemini-2.5-flash" },
  { value: "gemini:gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", provider: "gemini" as const, model: "gemini-3.5-flash-lite" },
  { value: "groq:openai/gpt-oss-20b", label: "GPT-OSS 20B (Groq)", provider: "groq" as const, model: "openai/gpt-oss-20b" },
  { value: "groq:openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)", provider: "groq" as const, model: "openai/gpt-oss-120b" },
  { value: "openrouter:openrouter/free", label: "OpenRouter Free (auto-select)", provider: "openrouter" as const, model: "openrouter/free" }
];

export default function SettingsPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [aiModel, setAiModel] = useState<AiModelSettings | null>(null);
  const [aiModelValue, setAiModelValue] = useState("ollama:qwen3:4b-instruct");
  const [aiModelLoading, setAiModelLoading] = useState(true);
  const [aiModelSaving, setAiModelSaving] = useState(false);
  const [aiModelNotice, setAiModelNotice] = useState<string | null>(null);
  const [aiModelError, setAiModelError] = useState<string | null>(null);

  useEffect(() => { setRole(decodeRole(window.localStorage.getItem("empanada-token"))); }, []);

  useEffect(() => {
    if (!role || !hasPermission(role, "ai-instructions.manage")) { setAiModelLoading(false); return; }
    void apiFetch<AiModelSettings>("/ai-actions/model")
      .then((settings) => { setAiModel(settings); const matching = aiModelOptions.find((option) => option.provider === settings.provider && option.model === settings.model); setAiModelValue(matching?.value ?? `${settings.provider}:${settings.model}`); })
      .catch((error) => setAiModelError(error instanceof Error ? error.message : "Unable to load AI model settings."))
      .finally(() => setAiModelLoading(false));
  }, [role]);

  const visibleSections = useMemo(() => sections.filter((section) => hasPermission(role, section.permission)), [role]);

  async function saveAiModel() {
    const option = aiModelOptions.find((item) => item.value === aiModelValue); if (!option) return;
    setAiModelSaving(true); setAiModelNotice(null); setAiModelError(null);
    try { const saved = await apiFetch<AiModelSettings>("/ai-actions/model", { method: "PATCH", body: JSON.stringify({ provider: option.provider, model: option.model }) }); setAiModel(saved); setAiModelNotice(`AI model switched to ${option.label}.`); }
    catch (error) { setAiModelError(error instanceof Error ? error.message : "Unable to save AI model settings."); }
    finally { setAiModelSaving(false); }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin Settings</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">Manage access to Empanada Hauz Admin and configure system behavior from one place.</p></div>
      {role && visibleSections.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleSections.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="group"><Card className="h-full p-6 transition-colors group-hover:border-accent/30 group-hover:bg-accent/[0.03]"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]"><Icon className="h-5 w-5 text-accent" /></div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-foreground/55">{description}</p><p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent">Open settings <span aria-hidden="true">→</span></p></Card></Link>)}</div> : role ? <Card className="p-8 text-center"><p className="font-semibold">No settings permissions</p><p className="mt-1 text-sm text-foreground/50">Your current role does not have access to any settings management area.</p></Card> : <Card className="p-8 text-sm text-foreground/50">Loading access permissions…</Card>}

      {role && hasPermission(role, "ai-instructions.manage") ? <Card className="mt-6 p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.06]"><Bot className="h-5 w-5 text-accent" /></div><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold">AI Model</h2><p className="mt-1 text-sm leading-6 text-foreground/55">Choose which model handles AI requests. Gemini requires <code className="rounded bg-white/[0.06] px-1">GEMINI_API_KEY</code>; Groq requires <code className="rounded bg-white/[0.06] px-1">GROQ_API_KEY</code>; OpenRouter requires <code className="rounded bg-white/[0.06] px-1">OPENROUTER_API_KEY</code> on the API server.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">Model</span><select value={aiModelValue} onChange={(event) => setAiModelValue(event.target.value)} disabled={aiModelLoading || aiModelSaving} className="w-full rounded-xl border border-white/[0.1] bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent/50">{aiModelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button type="button" onClick={() => void saveAiModel()} disabled={aiModelLoading || aiModelSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"><Save className="h-4 w-4" />{aiModelSaving ? "Saving…" : "Save model"}</button></div><div className="mt-3 text-xs text-foreground/45">Current: {aiModel ? `${aiModel.provider} / ${aiModel.model}` : aiModelLoading ? "Loading…" : "Unavailable"}</div>{aiModelNotice ? <p className="mt-2 text-sm text-emerald-500">{aiModelNotice}</p> : null}{aiModelError ? <p className="mt-2 text-sm text-destructive">{aiModelError}</p> : null}</div></div></Card> : null}

      <Card className="mt-6 p-5"><div className="flex items-start gap-4"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-foreground/55" /><div><h2 className="font-semibold">Role-based access control</h2><p className="mt-1 text-sm leading-6 text-foreground/55">Settings cards are filtered from the signed-in role, while the API independently enforces the same permission matrix. Product management is restricted to Admin; Operations can view the live catalog through authorized endpoints.</p></div></div></Card>
    </main>
  );
}
