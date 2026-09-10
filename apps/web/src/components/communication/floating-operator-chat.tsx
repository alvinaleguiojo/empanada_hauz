"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Mic, Send, Video, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";

type OperatorChatMessage = {
  id: string;
  from?: string;
  name: string;
  text: string;
  createdAt: string;
};

export function FloatingOperatorChat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<OperatorChatMessage[]>([]);
  const [clientId, setClientId] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("empanada-voice-client-id");
    const id = stored ?? crypto.randomUUID();
    window.sessionStorage.setItem("empanada-voice-client-id", id);
    setClientId(id);

    apiFetch<OperatorChatMessage[]>("/chat/messages")
      .then(setMessages)
      .catch(() => undefined);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleMessage = (message: OperatorChatMessage) => {
      if (!message?.id || !message.text) return;
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message].slice(-200)));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("operator.chat.message", handleMessage);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("operator.chat.message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 0);
    }
  }, [open, messages]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !clientId || !socket.connected) return;

    const message: OperatorChatMessage = {
      id: crypto.randomUUID(),
      from: clientId,
      name: "Empanada Hauz Operator",
      text,
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, message].slice(-200));
    setDraft("");
    socket.emit("operator.chat.send", message);
  }

  function openCall(type: "audio" | "video") {
    const communicationsButton = document.querySelector<HTMLButtonElement>('button[title="Communications"]');
    if (!communicationsButton) return;

    communicationsButton.click();
    window.setTimeout(() => {
      const callButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === (type === "audio" ? "Audio" : "Video"),
      );
      callButton?.click();
    }, 80);
  }

  const content = (
    <div className="pointer-events-none fixed inset-0 z-[9998]">
      <div className="pointer-events-auto fixed bottom-6 right-6 flex flex-col items-end">
        {open ? (
          <section className="floating-operator-chat-panel mb-3 flex h-[min(560px,78dvh)] w-[min(360px,calc(100vw-104px))] flex-col overflow-hidden rounded-t-2xl border border-white/[0.12] bg-[#111827] shadow-[0_-16px_55px_rgba(0,0,0,0.42)]">
            <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-accent"><MessageCircle size={17} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Communications</p>
                <p className="text-[10px] text-white/42">Operator chat {connected ? "· online" : "· offline"}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/[0.07] hover:text-white" aria-label="Close Communications"><X size={17} /></button>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {messages.length === 0 ? <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center"><MessageCircle size={26} className="mb-3 text-white/25" /><p className="text-sm font-medium text-white/70">No messages yet</p><p className="mt-1 max-w-[240px] text-xs leading-5 text-white/38">Chat with another open Empanada Hauz operator.</p></div> : null}
              {messages.map((message) => {
                const mine = message.from === clientId;
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-xs ${mine ? "rounded-br-md bg-accent text-black" : "rounded-bl-md bg-white/[0.07] text-white"}`}>
                      <div className="mb-1 flex items-center gap-2 text-[9px] opacity-55"><span>{mine ? "You" : message.name}</span><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
                      <p className="whitespace-pre-wrap break-words leading-5">{message.text}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <div className="shrink-0 border-t border-white/10 p-3">
              <div className="mb-2 flex items-center gap-2">
                <button type="button" onClick={() => openCall("audio")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/16"><Mic size={14} />Audio</button>
                <button type="button" onClick={() => openCall("video")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[11px] font-semibold text-sky-100 transition hover:bg-sky-400/16"><Video size={14} />Video</button>
              </div>
              <form onSubmit={sendMessage} className="flex gap-2">
                <input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!connected} placeholder={connected ? "Message operators" : "Realtime disconnected"} className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-black/20 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-accent/60 disabled:opacity-50" />
                <button type="submit" disabled={!draft.trim() || !connected} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message"><Send size={15} /></button>
              </form>
            </div>
          </section>
        ) : null}

        <button type="button" onClick={() => setOpen((value) => !value)} className="relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.14] bg-panel/95 text-foreground shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur transition hover:scale-105 hover:bg-white/[0.1]" aria-label="Open Communications" title="Communications">
          <MessageCircle size={24} />
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
