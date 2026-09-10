"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Send, Sparkles, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Give me today's business summary.",
  "What products are currently available and which are featured?",
  "Which orders need attention right now?",
  "Analyze our recent sales and top products.",
  "Show me inventory items that are near reorder level."
];

export default function AdminAiAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ reply: string }>("/ai-admin-agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history: messages.slice(-12) })
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the Admin AI Agent.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-medium text-foreground/55 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Settings</Link>
          <div className="mt-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.06]"><Bot className="h-5 w-5 text-accent" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin AI</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Business Agent</h1></div></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">Ask questions about the business in natural language. The agent can read live business data and use approved application tools.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.06] px-3 py-1.5 text-xs font-medium text-accent"><Sparkles className="h-3.5 w-3.5" /> Live business context</div>
      </div>

      <Card className="flex min-h-[620px] flex-1 flex-col overflow-hidden">
        <div className="border-b border-white/[0.08] px-5 py-4"><p className="font-semibold">Empanada Hauz Admin Agent</p><p className="mt-1 text-xs text-foreground/45">Reads business data on each request. Consequential write actions require explicit confirmation.</p></div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/[0.06]"><Bot className="h-7 w-7 text-accent" /></div>
              <h2 className="mt-5 text-xl font-semibold">What do you want to know?</h2>
              <p className="mt-2 text-sm leading-6 text-foreground/50">Ask about sales, orders, customers, products, inventory, production, expenses, deliveries, riders, referrals, analytics, or operational tasks.</p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setInput(suggestion)} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-foreground/65 transition hover:border-accent/25 hover:bg-accent/[0.04]">{suggestion}</button>)}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`flex max-w-[88%] gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">{message.role === "user" ? <User className="h-4 w-4 text-foreground/55" /> : <Bot className="h-4 w-4 text-accent" />}</div><div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-accent text-accent-foreground" : "border border-white/[0.08] bg-white/[0.03] text-foreground/75"}`}><p className="whitespace-pre-wrap">{message.content}</p></div></div></div>)}
          {loading ? <div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]"><Bot className="h-4 w-4 text-accent" /></div><div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-foreground/50">Thinking and checking business data…</div></div> : null}
          {error ? <div className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
        </div>

        <form onSubmit={sendMessage} className="border-t border-white/[0.08] p-4"><div className="flex gap-2"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} placeholder="Ask the Admin Agent anything about the business…" className="min-h-12 flex-1 resize-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-foreground/30 focus:border-accent/50"/><button type="submit" disabled={!input.trim() || loading} className="self-end inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"><Send className="h-4 w-4" /> Send</button></div><p className="mt-2 text-[11px] text-foreground/35">Enter to send · Shift+Enter for a new line</p></form>
      </Card>
    </main>
  );
}
