"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Give me today's business summary.",
  "Which orders need attention right now?",
  "Analyze our recent sales and top products.",
  "Show me inventory items near reorder level."
];

export function FloatingAiAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages, loading]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const result = await apiFetch<{ reply: string }>("/ai-admin-agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history })
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the Admin AI Agent.");
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <div className="pointer-events-none fixed inset-0 z-[10000]">
      <div className="pointer-events-auto fixed bottom-[166px] right-4 flex flex-col items-end sm:right-6">
        {open ? (
          <div className="mb-2 flex h-[min(620px,calc(100dvh-210px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-accent/20 bg-background shadow-[0_28px_90px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.04]">
            <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Bot size={20} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Admin AI Agent</p>
                <p className="mt-0.5 text-[11px] text-foreground/45">Live business data & approved tools</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-white/[0.06] hover:text-foreground" aria-label="Close Admin AI Agent"><X size={17} /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
              {messages.length === 0 ? (
                <div className="py-5">
                  <div className="mb-4 rounded-xl border border-accent/15 bg-accent/[0.05] p-4">
                    <div className="flex items-center gap-2 text-accent"><Sparkles size={16} /><p className="text-xs font-semibold uppercase tracking-[0.18em]">Business Agent</p></div>
                    <p className="mt-2 text-sm leading-5 text-foreground/65">Ask about sales, orders, customers, products, inventory, production, expenses, deliveries, riders, referrals, analytics, or operational tasks.</p>
                  </div>
                  <div className="space-y-2">
                    {suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => setInput(suggestion)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-left text-xs text-foreground/65 transition hover:border-accent/25 hover:bg-accent/[0.04]">{suggestion}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${message.role === "user" ? "bg-accent text-accent-foreground" : "border border-white/[0.08] bg-white/[0.035] text-foreground/75"}`}>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                ))}
                {loading ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-xs text-foreground/50"><Loader2 size={14} className="animate-spin" /> Checking business data…</div>
                  </div>
                ) : null}
                {error ? <div className="rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">{error}</div> : null}
                <div ref={endRef} />
              </div>
            </div>

            <form onSubmit={sendMessage} className="shrink-0 border-t border-white/[0.08] p-3">
              <div className="flex items-end gap-2">
                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} placeholder="Ask the Admin Agent…" className="min-h-11 max-h-28 min-w-0 flex-1 resize-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-xs outline-none placeholder:text-foreground/30 focus:border-accent/50" />
                <button type="submit" disabled={!input.trim() || loading} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-50" aria-label="Send message"><Send size={16} /></button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-foreground/30">Enter to send · Shift+Enter for a new line</p>
            </form>
          </div>
        ) : null}

        <button type="button" onClick={() => setOpen((value) => !value)} className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.16] bg-accent text-black shadow-[0_16px_40px_rgba(0,0,0,0.4)] transition hover:scale-105 hover:brightness-110" aria-label="Open Admin AI Agent" title="Admin AI Agent">
          <Bot size={23} />
          <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-lg bg-black/85 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">AI Chat</span>
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
