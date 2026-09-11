"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Loader2, Mic, Send, Sparkles, Square, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };
type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const suggestions = [
  "Give me today's business summary.",
  "Which orders need attention right now?",
  "Analyze our recent sales and top products.",
  "Show me inventory items near reorder level."
];

const SPEECH_THRESHOLD = 0.018;
const MIN_SPEECH_MS = 250;
const SILENCE_MS = 900;

export function FloatingAiAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");

  const voiceModeRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const speechStartedAtRef = useRef<number | null>(null);
  const lastSpeechAtRef = useRef<number | null>(null);
  const discardNextRecordingRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages, loading, voiceState]);

  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
      discardNextRecordingRef.current = true;
      stopVad();
      stopAudioPlayback();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, []);

  async function sendToAgent(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return { reply: "", fastLane: false };

    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const result = await apiFetch<{ reply: string; fastLane?: boolean }>("/ai-admin-agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, history })
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
      return { reply: result.reply, fastLane: result.fastLane === true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reach the Admin AI Agent.";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function sendText(text: string) {
    if (loading || voiceModeRef.current) return;
    try {
      await sendToAgent(text);
    } catch {
      // Error state is already shown by sendToAgent.
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    await sendText(input);
  }

  function stopVad() {
    if (vadFrameRef.current !== null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    speechStartedAtRef.current = null;
    lastSpeechAtRef.current = null;
  }

  function stopAudioPlayback() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    const source = playbackSourceRef.current;
    playbackSourceRef.current = null;
    if (source) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
  }

  async function ensureAudioContext() {
    if (typeof window === "undefined") throw new Error("Audio playback is unavailable.");
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Audio playback is not supported by this browser.");

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    if (context.state === "suspended") await context.resume();
    return context;
  }

  function cleanupRecorder() {
    stopVad();
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }

  function speakInstantReply(text: string) {
    if (!voiceModeRef.current || !text.trim() || typeof window === "undefined" || !window.speechSynthesis) return false;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = "en-US";
    utterance.rate = 1.05;
    utterance.pitch = 1;

    return new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speakReply(text: string, fastLane = false) {
    if (!voiceModeRef.current || !text.trim()) return;

    setVoiceState("speaking");
    stopAudioPlayback();

    if (fastLane && typeof window !== "undefined" && window.speechSynthesis) {
      try {
        await speakInstantReply(text);
        return;
      } catch {
        // Fall back to server TTS below.
      }
    }

    try {
      const audio = await apiFetchBlob("/tts", {
        method: "POST",
        body: JSON.stringify({ text: text.trim() })
      });

      if (!voiceModeRef.current) return;

      const context = await ensureAudioContext();
      const buffer = await context.decodeAudioData(await audio.arrayBuffer());
      if (!voiceModeRef.current) return;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      playbackSourceRef.current = source;

      await new Promise<void>((resolve, reject) => {
        source.onended = () => resolve();
        try {
          source.start(0);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      if (voiceModeRef.current) {
        throw new Error(err instanceof Error ? err.message : "Unable to play the Cebuano voice.");
      }
    } finally {
      stopAudioPlayback();
    }
  }

  async function transcribeRecording(blob: Blob) {
    if (!blob.size) return;

    setVoiceState("transcribing");
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("file", blob, `admin-ai-voice.${extension}`);
      const result = await apiFetch<{ text?: string; transcript?: string }>("/transcribe", {
        method: "POST",
        body: formData
      });
      const transcript = (result.text ?? result.transcript ?? "").trim();
      setLoading(false);

      if (!transcript || !voiceModeRef.current) {
        if (voiceModeRef.current) setVoiceState("listening");
        return;
      }

      setVoiceState("thinking");
      const resultFromAgent = await sendToAgent(transcript);
      if (!voiceModeRef.current) return;

      await speakReply(resultFromAgent.reply, resultFromAgent.fastLane);
      if (voiceModeRef.current) beginRecordingCycle();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Unable to process the voice conversation.");
      if (voiceModeRef.current) beginRecordingCycle();
    }
  }

  function monitorVad(stream: MediaStream, recorder: MediaRecorder) {
    stopVad();

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      recorder.stop();
      return;
    }

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser);
    analyserRef.current = analyser;

    const buffer = new Uint8Array(analyser.fftSize);
    const check = () => {
      if (recorder.state !== "recording" || !voiceModeRef.current) return;

      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const now = performance.now();

      if (rms >= SPEECH_THRESHOLD) {
        if (speechStartedAtRef.current === null) speechStartedAtRef.current = now;
        lastSpeechAtRef.current = now;
      } else if (speechStartedAtRef.current !== null && lastSpeechAtRef.current !== null) {
        const speechDuration = now - speechStartedAtRef.current;
        const silenceDuration = now - lastSpeechAtRef.current;
        if (speechDuration >= MIN_SPEECH_MS && silenceDuration >= SILENCE_MS) {
          stopVad();
          recorder.stop();
          return;
        }
      }

      vadFrameRef.current = requestAnimationFrame(check);
    };

    void context.resume().finally(() => {
      vadFrameRef.current = requestAnimationFrame(check);
    });
  }

  function beginRecordingCycle() {
    const stream = streamRef.current;
    if (!voiceModeRef.current || !stream || recording || recorderRef.current) return;

    try {
      const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      discardNextRecordingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const discard = discardNextRecordingRef.current;
        discardNextRecordingRef.current = false;
        cleanupRecorder();

        if (!discard && blob.size > 0 && voiceModeRef.current) {
          void transcribeRecording(blob);
        } else if (voiceModeRef.current) {
          setVoiceState("listening");
        }
      };

      recorder.onerror = () => {
        cleanupRecorder();
        setError("The microphone recording failed. Please try again.");
        if (voiceModeRef.current) beginRecordingCycle();
      };

      recorder.start(250);
      setRecording(true);
      setVoiceState("listening");
      monitorVad(stream, recorder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start voice recording.");
    }
  }

  function stopVoiceConversation() {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setVoiceState("idle");
    setError("");
    stopVad();
    stopAudioPlayback();

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      discardNextRecordingRef.current = true;
      recorderRef.current.stop();
    } else {
      cleanupRecorder();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  async function startVoiceConversation() {
    if (voiceModeRef.current) return;
    setError("");

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice recording is not supported by this browser.");
      return;
    }

    try {
      await ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      voiceModeRef.current = true;
      setVoiceMode(true);
      setVoiceState("listening");
      setLoading(false);
      beginRecordingCycle();
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceState("idle");
      setError(err instanceof Error ? err.message : "Microphone access was denied or unavailable.");
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    }
  }

  const voiceLabel = voiceMode
    ? voiceState === "listening"
      ? "Listening… speak naturally; pauses are detected automatically"
      : voiceState === "transcribing"
        ? "Transcribing…"
        : voiceState === "thinking"
          ? "Thinking…"
          : "Speaking…"
    : "Mic to start continuous voice conversation";

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
            <button type="button" onClick={() => { if (voiceModeRef.current) stopVoiceConversation(); setOpen(false); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 transition hover:bg-white/[0.06] hover:text-foreground" aria-label="Close Admin AI Agent"><X size={17} /></button>
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
                    <button key={suggestion} type="button" onClick={() => setInput(suggestion)} disabled={voiceMode} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-left text-xs text-foreground/65 transition hover:border-accent/25 hover:bg-accent/[0.04] disabled:opacity-40">{suggestion}</button>
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
              {voiceMode ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-accent/20 bg-accent/[0.06] px-3.5 py-2.5 text-xs text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-current" /> {voiceLabel}</div>
                </div>
              ) : null}
              {loading && !voiceMode ? (
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
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={voiceMode || loading} rows={2} placeholder={voiceMode ? "Voice conversation active…" : "Ask the Admin Agent…"} className="min-h-11 max-h-28 min-w-0 flex-1 resize-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-xs outline-none placeholder:text-foreground/30 focus:border-accent/50 disabled:opacity-60" />
              <div className="flex shrink-0 flex-col gap-2">
                <button type="button" onClick={() => { if (voiceModeRef.current) stopVoiceConversation(); else void startVoiceConversation(); }} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition hover:brightness-110 ${voiceMode ? "bg-danger text-white" : "border border-white/[0.1] bg-white/[0.04] text-foreground hover:bg-accent/10 hover:text-accent"}`} aria-label={voiceMode ? "Stop voice conversation" : "Start voice conversation"} title={voiceMode ? "Stop voice conversation" : "Start voice conversation"}>
                  {voiceMode ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
                </button>
                <button type="submit" disabled={!input.trim() || loading || voiceMode} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-50" aria-label="Send message"><Send size={16} /></button>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-foreground/30">{voiceMode ? "Continuous voice mode · pauses trigger messages · instant replies for simple chat · business answers use Cebuano TTS" : "Enter to send · Shift+Enter for a new line · Mic to speak continuously"}</p>
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
