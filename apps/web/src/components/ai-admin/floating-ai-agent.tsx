"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Loader2, Mic, Send, Sparkles, Square, X } from "lucide-react";
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
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages, loading]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function sendText(text: string, allowWhileLoading = false) {
    const trimmed = text.trim();
    if (!trimmed || (loading && !allowWhileLoading)) return;

    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const result = await apiFetch<{ reply: string }>("/ai-admin-agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, history })
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the Admin AI Agent.");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (recording) return;
    await sendText(input);
  }

  async function transcribeRecording(blob: Blob) {
    if (!blob.size) {
      setError("The recording was empty. Please try again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", blob, "admin-ai-voice.webm");
      const result = await apiFetch<{ text?: string; transcript?: string }>("/transcribe", {
        method: "POST",
        body: formData
      });
      const transcript = (result.text ?? result.transcript ?? "").trim();
      if (!transcript) {
        setError("No speech was detected. Please try again.");
        setLoading(false);
        return;
      }
      await sendText(transcript, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to transcribe the recording.");
      setLoading(false);
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  async function startRecording() {
    if (loading || recording) return;
    setError("");

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        recorderRef.current = null;
        streamRef.current = null;
        setRecording(false);
        void transcribeRecording(blob);
      };

      recorder.onerror = () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        setError("The microphone recording failed. Please try again.");
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setError(err instanceof Error ? err.message : "Microphone access was denied or unavailable.");
    }
  }

  const content = (
    <div className="pointer-events-none fixed inset-0 z-[10000]">
      {open ? (
        <div className="pointer-events-auto fixed bottom-0 right-[92px] z-[10001] flex h-[min(620px,78dvh)] w-[min(390px,calc(100vw-116px))] flex-col overflow-hidden rounded-t-2xl border border-accent/20 bg-background shadow-[0_-14px_50px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.04] sm:right-[94px] sm:w-[min(390px,calc(100vw-118px))]">
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
              {recording ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-accent/20 bg-accent/[0.06] px-3.5 py-2.5 text-xs text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-current" /> Listening… tap the mic to stop</div>
                </div>
              ) : null}
              {loading ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-xs text-foreground/50"><Loader2 size={14} className="animate-spin" /> Transcribing / checking business data…</div>
                </div>
              ) : null}
              {error ? <div className="rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">{error}</div> : null}
              <div ref={endRef} />
            </div>
          </div>

          <form onSubmit={sendMessage} className="shrink-0 border-t border-white/[0.08] p-3">
            <div className="flex items-end gap-2">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={recording || loading} rows={2} placeholder={recording ? "Listening…" : "Ask the Admin Agent…"} className="min-h-11 max-h-28 min-w-0 flex-1 resize-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-xs outline-none placeholder:text-foreground/30 focus:border-accent/50 disabled:opacity-60" />
              <div className="flex shrink-0 flex-col gap-2">
                <button type="button" onClick={() => { if (recording) stopRecording(); else void startRecording(); }} disabled={loading} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition hover:brightness-110 disabled:opacity-50 ${recording ? "bg-danger text-white" : "border border-white/[0.1] bg-white/[0.04] text-foreground hover:bg-accent/10 hover:text-accent"}`} aria-label={recording ? "Stop recording" : "Start voice input"} title={recording ? "Stop recording" : "Use microphone"}>
                  {recording ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
                </button>
                <button type="submit" disabled={!input.trim() || loading || recording} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-50" aria-label="Send message"><Send size={16} /></button>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-foreground/30">Enter to send · Shift+Enter for a new line · Mic to speak</p>
          </form>
        </div>
      ) : null}

      <div className="pointer-events-auto fixed bottom-[166px] right-4 flex flex-col items-end sm:right-6">
        <button type="button" onClick={() => setOpen((value) => !value)} className="group relative z-[10002] flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.16] bg-accent text-black shadow-[0_16px_40px_rgba(0,0,0,0.4)] transition hover:scale-105 hover:brightness-110" aria-label="Open Admin AI Agent" title="Admin AI Agent">
          <Bot size={23} />
          <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-lg bg-black/85 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">AI Chat</span>
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
