"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

const SESSION_KEY = "empanada-public-ai-session";

type AgentMessage = { role: "assistant" | "user"; content: string };
type FormContext = {
  selectedFlavors?: Array<{ name: string; quantity: number }>;
  deliveryMethod?: string;
  paymentMethod?: string;
  deliveryDate?: string;
  address?: string;
  landmark?: string;
};

function getSessionId() {
  if (typeof window === "undefined") return "00000000-0000-4000-8000-000000000000";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

export default function PublicAiAgent() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: "assistant", content: "Hi po! Need help choosing flavors, checking availability, or filling out your order? 😊" }
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const quickQuestions = useMemo(() => ["What flavors are available?", "Is Mango sold out?", "How do I place an order?"], []);

  const getFormContext = (): FormContext => {
    if (typeof window === "undefined") return {};
    const selected: Array<{ name: string; quantity: number }> = [];
    document.querySelectorAll<HTMLElement>("[aria-label$=' quantity']").forEach((input) => {
      const label = input.getAttribute("aria-label") ?? "";
      const name = label.replace(/ quantity$/i, "").trim();
      const value = input instanceof HTMLInputElement ? Number(input.value) : 0;
      if (name && Number.isFinite(value) && value > 0) selected.push({ name, quantity: value });
    });
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select"));
    const deliverySelect = selects.find((select) => select.value === "pickup" || select.value === "maxim");
    const paymentSelect = selects.find((select) => select.value === "cod" || select.value === "gcash");
    const addressInput = document.querySelector<HTMLInputElement>("input[placeholder^='Address']");
    const landmarkInput = document.querySelector<HTMLInputElement>("input[placeholder^='Landmark']");
    const dateInput = document.querySelector<HTMLInputElement>("input[type='date']");
    return {
      selectedFlavors: selected,
      deliveryMethod: deliverySelect?.value,
      paymentMethod: paymentSelect?.value,
      deliveryDate: dateInput?.value,
      address: addressInput?.value?.trim(),
      landmark: landmarkInput?.value?.trim()
    };
  };

  async function send(nextMessage?: string) {
    const text = (nextMessage ?? message).trim();
    if (!text || sending) return;
    setMessage("");
    setError("");
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const result = await apiFetch<{ reply: string }>("/ai/public/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: getSessionId(),
          message: text,
          history: messages.slice(-12),
          context: getFormContext()
        })
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant is unavailable right now.");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-5 z-50 inline-flex items-center gap-2 rounded-full border-[3px] border-[#3a2c1c] bg-[#C0472B] px-4 py-3 text-sm font-bold text-[#F6EFDD] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.7)] transition hover:scale-[1.02] sm:bottom-5"
          aria-label="Open Empanada Hauz AI assistant"
        >
          <Bot size={18} /> Ask AI
        </button>
      ) : (
        <div className="fixed bottom-24 right-4 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-[3px] border-[#3a2c1c] bg-[#241c13] text-[#F2E8D5] shadow-[0_18px_50px_-15px_rgba(0,0,0,0.8)] sm:bottom-5 sm:right-5">
          <div className="flex items-center justify-between border-b border-[#3a2c1c] bg-[#1c150e] px-4 py-3">
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#E3A64B]/15 text-[#E3A64B]"><Bot size={16} /></span><div><p className="text-sm font-bold">Empanada Hauz AI</p><p className="text-[10px] uppercase tracking-[0.18em] text-[#F2E8D5]/45">Order assistant</p></div></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-[#F2E8D5]/55 transition hover:bg-white/5 hover:text-[#F2E8D5]" aria-label="Close AI assistant"><X size={17} /></button>
          </div>
          <div className="max-h-[330px] space-y-2.5 overflow-y-auto p-3">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-5 ${item.role === "user" ? "bg-[#E3A64B] text-[#1a140d]" : "border border-[#3a2c1c] bg-[#1a140d] text-[#F2E8D5]/90"}`}>{item.content}</div>
              </div>
            ))}
            {sending ? <div className="flex justify-start"><div className="rounded-2xl border border-[#3a2c1c] bg-[#1a140d] px-3 py-2 text-xs text-[#F2E8D5]/50">Thinking…</div></div> : null}
          </div>
          <div className="border-t border-[#3a2c1c] p-3">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {quickQuestions.map((question) => <button key={question} type="button" disabled={sending} onClick={() => void send(question)} className="shrink-0 rounded-full border border-[#F2E8D5]/15 bg-[#1a140d] px-2.5 py-1.5 text-[11px] text-[#F2E8D5]/70">{question}</button>)}
            </div>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} maxLength={600} placeholder="Ask about flavors or your order…" className="min-w-0 flex-1 rounded-xl border-2 border-[#3a2c1c] bg-[#1a140d] px-3 py-2.5 text-sm text-[#F6EFDD] outline-none placeholder:text-[#F2E8D5]/30" />
              <button type="submit" disabled={sending || !message.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7A9B4E] text-[#1a140d] disabled:opacity-40" aria-label="Send message"><Send size={16} /></button>
            </form>
            {error ? <p className="mt-2 flex items-center gap-1 text-[11px] text-[#ff9e8d]"><MessageCircle size={12} /> {error}</p> : null}
          </div>
        </div>
      )}
    </>
  );
}
