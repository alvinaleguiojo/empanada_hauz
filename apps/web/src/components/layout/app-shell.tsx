"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ChevronLeft, ClipboardList, LayoutDashboard, LogOut, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MonitorOff, MonitorUp, ReceiptText, Send, Share2, Truck, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";
import { useRealtimeStore } from "@/store/realtime-store";
import { VOICE_ICE_SERVERS } from "@/lib/config";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/referrals", label: "Referrals", icon: Share2 },
  { href: "/delivery-network", label: "Delivery", icon: Truck}
];

const VOICE_CALL_CONFIGURATION: RTCConfiguration = {
  iceServers: VOICE_ICE_SERVERS
};

type VoiceCallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "active";
type VoiceCallType = "audio" | "video";

type VoiceCallSignal = {
  callId?: string;
  from?: string;
  to?: string;
  name?: string;
  callType?: VoiceCallType;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type OperatorChatMessage = {
  id: string;
  from?: string;
  name: string;
  text: string;
  createdAt: string;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const push = useRealtimeStore((state) => state.push);
  const notifications = useRealtimeStore((state) => state.notifications);
  const markNotificationsRead = useRealtimeStore((state) => state.markNotificationsRead);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission>("default");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [operatorChatDraft, setOperatorChatDraft] = useState("");
  const [operatorChatMessages, setOperatorChatMessages] = useState<OperatorChatMessage[]>([]);
  const [operatorChatUnread, setOperatorChatUnread] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [voiceCallStatus, setVoiceCallStatus] = useState<VoiceCallStatus>("idle");
  const [voiceCallError, setVoiceCallError] = useState<string | null>(null);
  const [voicePeerName, setVoicePeerName] = useState("Operator");
  const [voiceClientId, setVoiceClientId] = useState("");
  const [voiceCallType, setVoiceCallType] = useState<VoiceCallType>("audio");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [panelDragging, setPanelDragging] = useState(false);
  const voiceCallStreamRef = useRef<MediaStream | null>(null);
  const voiceCallRemoteStreamRef = useRef<MediaStream | null>(null);
  const voiceCallScreenStreamRef = useRef<MediaStream | null>(null);
  const voiceCallPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const voiceCallRemoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceCallLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const voiceCallRemoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const voiceCallVideoStageRef = useRef<HTMLDivElement | null>(null);
  const voiceCallPanelRef = useRef<HTMLDivElement | null>(null);
  const panelDragOffsetRef = useRef({ x: 0, y: 0 });
  const voiceCallStatusRef = useRef<VoiceCallStatus>("idle");
  const voiceCallPersistHydratedRef = useRef(false);
  const voiceCallTypeRef = useRef<VoiceCallType>("audio");
  const voiceMutedRef = useRef(false);
  const videoMutedRef = useRef(false);
  const voiceCallIdRef = useRef<string | null>(null);
  const voiceRemoteClientIdRef = useRef<string | null>(null);
  const voiceConnectionFailTimerRef = useRef<number | null>(null);
  const pendingVoiceIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const recentNotificationKeysRef = useRef(new Map<string, number>());
  const communicationsOpenRef = useRef(false);
  const operatorChatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((item) => !item.read).length;
  const voiceCallActive = voiceCallStatus === "active" || voiceCallStatus === "connecting" || voiceCallStatus === "outgoing";
  const voiceCallBusy = voiceCallStatus !== "idle";

  useEffect(() => {
    setSpeechEnabled(window.localStorage.getItem("empanada-notification-speech") === "on");

    const browserNotificationStored = window.localStorage.getItem("empanada-browser-notifications");
    if ("Notification" in window) {
      setBrowserNotificationPermission(Notification.permission);
      setBrowserNotificationsEnabled(browserNotificationStored !== "off" && Notification.permission === "granted");
    }

    setSidebarCollapsed(window.localStorage.getItem("empanada-sidebar-collapsed") === "true");
    const storedVoiceClientId = window.sessionStorage.getItem("empanada-voice-client-id");
    const nextVoiceClientId = storedVoiceClientId ?? crypto.randomUUID();
    window.sessionStorage.setItem("empanada-voice-client-id", nextVoiceClientId);
    setVoiceClientId(nextVoiceClientId);

    apiFetch<OperatorChatMessage[]>("/chat/messages")
      .then((history) => setOperatorChatMessages(history))
      .catch(() => undefined);

    return () => {
      cleanupVoiceCall();
    };
  }, []);

  useEffect(() => {
    voiceCallStatusRef.current = voiceCallStatus;

    if (voiceCallStatus === "connecting" || voiceCallStatus === "active") {
      voiceCallPersistHydratedRef.current = true;
      if (voiceCallIdRef.current && voiceRemoteClientIdRef.current) {
        window.sessionStorage.setItem(
          "empanada-active-voice-call",
          JSON.stringify({
            callId: voiceCallIdRef.current,
            remoteClientId: voiceRemoteClientIdRef.current,
            type: voiceCallTypeRef.current,
            peerName: voicePeerName
          })
        );
      }
    } else if (voiceCallStatus === "idle") {
      if (voiceCallPersistHydratedRef.current) {
        window.sessionStorage.removeItem("empanada-active-voice-call");
      }
    }
  }, [voiceCallStatus, voicePeerName]);

  useEffect(() => {
    const ringtone = ringtoneAudioRef.current;
    if (!ringtone) {
      return;
    }

    if (voiceCallStatus === "incoming") {
      ringtone.currentTime = 0;
      void ringtone.play().catch(() => undefined);
    } else {
      ringtone.pause();
      ringtone.currentTime = 0;
    }
  }, [voiceCallStatus]);

  useEffect(() => {
    communicationsOpenRef.current = voiceCallOpen && chatOpen;
    if (voiceCallOpen && chatOpen) {
      setOperatorChatUnread(0);
      window.setTimeout(() => operatorChatMessagesEndRef.current?.scrollIntoView({ block: "end" }), 0);
    }
  }, [voiceCallOpen, chatOpen]);

  useEffect(() => {
    if (voiceCallOpen && chatOpen) {
      operatorChatMessagesEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [operatorChatMessages, voiceCallOpen, chatOpen]);

  useEffect(() => {
    voiceCallTypeRef.current = voiceCallType;
  }, [voiceCallType]);

  useEffect(() => {
    voiceMutedRef.current = voiceMuted;
    setVoiceCallAudioEnabled(!voiceMuted);
  }, [voiceMuted]);

  useEffect(() => {
    videoMutedRef.current = videoMuted;
    setVoiceCallVideoEnabled(!videoMuted);
  }, [videoMuted]);

  useEffect(() => {
    if (voiceCallType !== "video" || !voiceCallOpen) {
      return;
    }

    if (voiceCallStreamRef.current && voiceCallLocalVideoRef.current) {
      voiceCallLocalVideoRef.current.srcObject = voiceCallStreamRef.current;
      void voiceCallLocalVideoRef.current.play().catch(() => undefined);
    }

    if (voiceCallRemoteStreamRef.current && voiceCallRemoteVideoRef.current) {
      voiceCallRemoteVideoRef.current.srcObject = voiceCallRemoteStreamRef.current;
      void voiceCallRemoteVideoRef.current.play().catch(() => undefined);
    }
  }, [voiceCallOpen, voiceCallStatus, voiceCallType]);

  useEffect(() => {
    if (!panelDragging) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const panel = voiceCallPanelRef.current;
      const width = panel?.offsetWidth ?? 0;
      const height = panel?.offsetHeight ?? 0;
      const nextX = clampNumber(event.clientX - panelDragOffsetRef.current.x, 8, window.innerWidth - width - 8);
      const nextY = clampNumber(event.clientY - panelDragOffsetRef.current.y, 8, window.innerHeight - height - 8);
      setPanelPosition({ x: nextX, y: nextY });
    }

    function handlePointerUp() {
      setPanelDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [panelDragging]);

  useEffect(() => {
    function handleFullscreenChange() {
      setVideoFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!voiceCallOpen) {
      setPanelPosition(null);
    }
  }, [voiceCallOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || !voiceCallBusy || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setVoiceMuted(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [voiceCallBusy]);

  useEffect(() => {
    if (!voiceCallBusy) {
      return;
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        setVoiceMuted(false);
      }
    };

    window.addEventListener("keyup", handleKeyUp);
    return () => window.removeEventListener("keyup", handleKeyUp);
  }, [voiceCallBusy]);

  useEffect(() => {
    const handleBeforeUnload = () => cleanupVoiceCall();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!voiceClientId) {
      return;
    }

    const announcePresence = () => {
      socket.emit("voice.client.join", { clientId: voiceClientId, name: "Empanada Hauz Operator" });
      setRealtimeConnected(socket.connected);
    };

    const handleIncomingCall = (payload: VoiceCallSignal) => {
      if (!payload.callId || !payload.from || payload.from === voiceClientId) {
        return;
      }
      voiceCallIdRef.current = payload.callId;
      voiceRemoteClientIdRef.current = payload.from;
      voiceCallTypeRef.current = payload.callType === "video" ? "video" : "audio";
      setVoiceCallType(voiceCallTypeRef.current);
      setVoicePeerName(payload.name || "Operator");
      setVoiceCallStatus("incoming");
      setVoiceCallOpen(true);
      setVoiceCallError(null);
    };

    const handleCallAccepted = (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.from) {
        return;
      }
      voiceRemoteClientIdRef.current = payload.from;
      setVoiceCallStatus("connecting");
      void createVoicePeerConnection(payload.from).then(async (peerConnection) => {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("voice.call.offer", {
          callId: voiceCallIdRef.current,
          from: voiceClientId,
          to: payload.from,
          description: offer
        });
      }).catch(() => endVoiceCall(false, "Couldn't start the call."));
    };

    const handleCallDeclined = (payload: VoiceCallSignal) => {
      if (isCurrentVoiceCall(payload)) {
        endVoiceCall(false, "Call declined.");
      }
    };

    const handleCallEnded = (payload: VoiceCallSignal) => {
      if (isCurrentVoiceCall(payload)) {
        endVoiceCall(false, "Call ended.");
      }
    };

    const handleOffer = (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.from || !payload.description) {
        return;
      }
      voiceRemoteClientIdRef.current = payload.from;
      void createVoicePeerConnection(payload.from).then(async (peerConnection) => {
        await peerConnection.setRemoteDescription(payload.description!);
        await flushPendingVoiceIceCandidates(peerConnection);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("voice.call.answer", {
          callId: voiceCallIdRef.current,
          from: voiceClientId,
          to: payload.from,
          description: answer
        });
        setVoiceCallStatus("connecting");
      }).catch(() => endVoiceCall(false, "Couldn't connect the call."));
    };

    const handleAnswer = (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.description) {
        return;
      }
      void voiceCallPeerConnectionRef.current?.setRemoteDescription(payload.description).then(() => flushPendingVoiceIceCandidates(voiceCallPeerConnectionRef.current!)).catch(() => endVoiceCall(false, "Couldn't finish connecting the call."));
    };

    const handleIce = (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.candidate) {
        return;
      }
      void addOrQueueVoiceIceCandidate(payload.candidate);
    };

    const handleClientJoined = () => {
      setRealtimeConnected(socket.connected);
    };

    announcePresence();
    socket.on("connect", announcePresence);
    socket.on("disconnect", () => setRealtimeConnected(false));
    socket.on("voice.call.incoming", handleIncomingCall);
    socket.on("voice.call.accepted", handleCallAccepted);
    socket.on("voice.call.declined", handleCallDeclined);
    socket.on("voice.call.ended", handleCallEnded);
    socket.on("voice.call.offer", handleOffer);
    socket.on("voice.call.answer", handleAnswer);
    socket.on("voice.call.ice", handleIce);
    socket.on("voice.client.joined", handleClientJoined);

    return () => {
      socket.off("connect", announcePresence);
      socket.off("voice.call.incoming", handleIncomingCall);
      socket.off("voice.call.accepted", handleCallAccepted);
      socket.off("voice.call.declined", handleCallDeclined);
      socket.off("voice.call.ended", handleCallEnded);
      socket.off("voice.call.offer", handleOffer);
      socket.off("voice.call.answer", handleAnswer);
      socket.off("voice.call.ice", handleIce);
      socket.off("voice.client.joined", handleClientJoined);
    };
  }, [voiceClientId]);

  function toggleSpeech() {
    setSpeechEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("empanada-notification-speech", next ? "on" : "off");
      if (next) {
        speakText("Notification speech is enabled.");
      } else {
        window.speechSynthesis?.cancel();
      }
      return next;
    });
  }

  async function toggleBrowserNotifications() {
    if (!("Notification" in window)) {
      return;
    }

    if (browserNotificationsEnabled) {
      window.localStorage.setItem("empanada-browser-notifications", "off");
      setBrowserNotificationsEnabled(false);
      return;
    }

    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setBrowserNotificationPermission(permission);
    if (permission === "granted") {
      window.localStorage.setItem("empanada-browser-notifications", "on");
      setBrowserNotificationsEnabled(true);
      showBrowserNotification("notifications.created", {
        type: "notifications.enabled",
        payload: { message: "Browser notifications are enabled." },
        createdAt: new Date().toISOString()
      });
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("empanada-sidebar-collapsed", String(next));
      return next;
    });
  }

  function logout() {
    window.localStorage.removeItem("empanada-token");
    document.cookie = "empanada-token=; path=/; max-age=0";
    window.location.href = "/login";
  }

  function sendOperatorChatMessage(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = operatorChatDraft.trim();
    if (!text || !voiceClientId || !socket.connected) {
      return;
    }

    const message: OperatorChatMessage = {
      id: crypto.randomUUID(),
      from: voiceClientId,
      name: "Empanada Hauz Operator",
      text,
      createdAt: new Date().toISOString()
    };

    setOperatorChatMessages((current) => [...current, message].slice(-100));
    setOperatorChatDraft("");
    socket.emit("operator.chat.send", message);
  }

  function isCurrentVoiceCall(payload: VoiceCallSignal) {
    return Boolean(payload.callId && payload.callId === voiceCallIdRef.current);
  }

  async function startVoiceCall(callType: VoiceCallType = "audio") {
    setVoiceCallOpen(true);

    if (voiceCallBusy) {
      endVoiceCall(true);
      return;
    }

    if (!voiceClientId) {
      setVoiceCallError("Voice call is still connecting. Try again in a moment.");
      return;
    }

    if (!socket.connected) {
      setVoiceCallError("Voice signaling is disconnected. Refresh and try again.");
      return;
    }

    try {
      voiceCallTypeRef.current = callType;
      setVoiceCallType(callType);
      setVoiceMuted(false);
      setVideoMuted(false);
      setScreenSharing(false);
      await ensureVoiceCallStream(callType);
      const callId = crypto.randomUUID();
      voiceCallIdRef.current = callId;
      voiceRemoteClientIdRef.current = null;
      setVoicePeerName("Operator");
      setVoiceCallStatus("outgoing");
      setVoiceCallError(null);
      socket.emit("voice.call.start", {
        callId,
        from: voiceClientId,
        name: "Empanada Hauz Operator",
        callType,
        createdAt: new Date().toISOString()
      });
    } catch {
      setVoiceCallError(callType === "video" ? "Camera or microphone permission was blocked or unavailable." : "Microphone permission was blocked or unavailable.");
    }
  }

  async function acceptVoiceCall() {
    if (!voiceRemoteClientIdRef.current || !voiceCallIdRef.current) {
      return;
    }

    try {
      setVoiceMuted(false);
      setVideoMuted(false);
      setScreenSharing(false);
      await ensureVoiceCallStream(voiceCallTypeRef.current);
      setVoiceCallStatus("connecting");
      setVoiceCallError(null);
      socket.emit("voice.call.accept", {
        callId: voiceCallIdRef.current,
        from: voiceClientId,
        to: voiceRemoteClientIdRef.current
      });
    } catch {
      setVoiceCallError(voiceCallTypeRef.current === "video" ? "Camera or microphone permission was blocked or unavailable." : "Microphone permission was blocked or unavailable.");
    }
  }

  function declineVoiceCall() {
    if (voiceRemoteClientIdRef.current && voiceCallIdRef.current) {
      socket.emit("voice.call.decline", {
        callId: voiceCallIdRef.current,
        from: voiceClientId,
        to: voiceRemoteClientIdRef.current
      });
    }

    cleanupVoiceCall();
    setVoiceCallStatus("idle");
    setVoiceCallType("audio");
    voiceCallTypeRef.current = "audio";
    setVoiceMuted(false);
    setVideoMuted(false);
    setScreenSharing(false);
    setVoicePeerName("Operator");
    setVoiceCallError(null);
  }

  function endVoiceCall(notifyPeer = true, message?: string) {
    if (notifyPeer && voiceRemoteClientIdRef.current && voiceCallIdRef.current) {
      socket.emit("voice.call.end", {
        callId: voiceCallIdRef.current,
        from: voiceClientId,
        to: voiceRemoteClientIdRef.current
      });
    }

    cleanupVoiceCall();
    setVoiceCallStatus("idle");
    setVoiceCallType("audio");
    voiceCallTypeRef.current = "audio";
    setVoiceMuted(false);
    setVideoMuted(false);
    setScreenSharing(false);
    setVoicePeerName("Operator");
    setVoiceCallError(message ?? null);
  }

  function cleanupVoiceCall() {
    clearVoiceConnectionFailTimer();
    const peerConnection = voiceCallPeerConnectionRef.current;
    voiceCallPeerConnectionRef.current = null;
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    }
    stopVoiceCallStream(voiceCallStreamRef.current);
    stopVoiceCallStream(voiceCallScreenStreamRef.current);
    voiceCallStreamRef.current = null;
    voiceCallScreenStreamRef.current = null;
    voiceCallRemoteStreamRef.current = null;
    if (voiceCallRemoteAudioRef.current) {
      voiceCallRemoteAudioRef.current.srcObject = null;
    }
    if (voiceCallLocalVideoRef.current) {
      voiceCallLocalVideoRef.current.srcObject = null;
    }
    if (voiceCallRemoteVideoRef.current) {
      voiceCallRemoteVideoRef.current.srcObject = null;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    pendingVoiceIceCandidatesRef.current = [];
    voiceCallIdRef.current = null;
    voiceRemoteClientIdRef.current = null;
  }

  function clearVoiceConnectionFailTimer() {
    if (voiceConnectionFailTimerRef.current !== null) {
      window.clearTimeout(voiceConnectionFailTimerRef.current);
      voiceConnectionFailTimerRef.current = null;
    }
  }

  async function ensureVoiceCallStream(callType: VoiceCallType = voiceCallTypeRef.current) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Media access is not supported in this browser.");
    }
    if (voiceCallStreamRef.current) {
      return voiceCallStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
    voiceCallStreamRef.current = stream;
    return stream;
  }

  function setVoiceCallAudioEnabled(enabled: boolean) {
    voiceCallStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  function setVoiceCallVideoEnabled(enabled: boolean) {
    voiceCallStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  function stopVoiceCallStream(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }

  function speakText(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  function showBrowserNotification(eventType: string, event: { type?: string; payload?: { message?: string }; createdAt?: string }) {
    if (!browserNotificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const title = event.type === "notifications.enabled" ? "Empanada Hauz" : eventType.replaceAll(".", " ");
    new Notification(title, { body: event.payload?.message ?? "You have a new notification." });
  }

  function handleNotification(event: { type?: string; payload?: { message?: string }; createdAt?: string }) {
    const key = `${event.type ?? "notification"}:${event.createdAt ?? ""}:${event.payload?.message ?? ""}`;
    const now = Date.now();
    const last = recentNotificationKeysRef.current.get(key);
    if (last && now - last < 5000) return;
    recentNotificationKeysRef.current.set(key, now);
    push({ id: crypto.randomUUID(), type: event.type ?? "notification", payload: event.payload ?? {}, createdAt: event.createdAt ?? new Date().toISOString(), read: false });
    if (speechEnabled && event.payload?.message) speakText(event.payload.message);
    showBrowserNotification("notifications.created", event);
  }

  useEffect(() => {
    const handler = (event: { type?: string; payload?: { message?: string }; createdAt?: string }) => handleNotification(event);
    socket.on("notifications.created", handler);
    return () => socket.off("notifications.created", handler);
  }, [speechEnabled, browserNotificationsEnabled]);

  useEffect(() => {
    const handler = (message: OperatorChatMessage) => {
      setOperatorChatMessages((current) => [...current, message].slice(-100));
      if (!communicationsOpenRef.current) setOperatorChatUnread((current) => current + 1);
    };
    socket.on("operator.chat.message", handler);
    return () => socket.off("operator.chat.message", handler);
  }, []);

  useEffect(() => {
    const restore = window.sessionStorage.getItem("empanada-active-voice-call");
    if (!restore || voiceCallBusy) return;
    try {
      const payload = JSON.parse(restore) as { callId?: string; remoteClientId?: string; type?: VoiceCallType; peerName?: string };
      if (!payload.callId || !payload.remoteClientId) return;
      voiceCallIdRef.current = payload.callId;
      voiceRemoteClientIdRef.current = payload.remoteClientId;
      voiceCallTypeRef.current = payload.type === "video" ? "video" : "audio";
      setVoiceCallType(voiceCallTypeRef.current);
      setVoicePeerName(payload.peerName ?? "Operator");
      setVoiceCallOpen(true);
      setVoiceCallStatus("connecting");
      void createVoicePeerConnection(payload.remoteClientId).catch(() => endVoiceCall(false, "Couldn't restore the call."));
    } catch {
      window.sessionStorage.removeItem("empanada-active-voice-call");
    }
  }, []);

  function startPanelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const panel = voiceCallPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panelDragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setPanelPosition((current) => current ?? { x: rect.left, y: rect.top });
    setPanelDragging(true);
    event.preventDefault();
  }

  async function addOrQueueVoiceIceCandidate(candidate: RTCIceCandidateInit) {
    const peerConnection = voiceCallPeerConnectionRef.current;
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingVoiceIceCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch {
      return;
    }
  }

  async function flushPendingVoiceIceCandidates(peerConnection: RTCPeerConnection) {
    const candidates = pendingVoiceIceCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      try { await peerConnection.addIceCandidate(candidate); } catch { continue; }
    }
  }

  async function createVoicePeerConnection(remoteClientId: string) {
    if (voiceCallPeerConnectionRef.current) return voiceCallPeerConnectionRef.current;
    const localStream = await ensureVoiceCallStream(voiceCallTypeRef.current);
    const peerConnection = new RTCPeerConnection(VOICE_CALL_CONFIGURATION);
    voiceCallPeerConnectionRef.current = peerConnection;
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) socket.emit("voice.call.ice", { callId: voiceCallIdRef.current, from: voiceClientId, to: remoteClientId, candidate: event.candidate.toJSON() });
    };
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) voiceCallRemoteStreamRef.current = remoteStream;
      if (remoteStream && voiceCallRemoteAudioRef.current) { voiceCallRemoteAudioRef.current.srcObject = remoteStream; void voiceCallRemoteAudioRef.current.play().catch(() => undefined); }
      if (remoteStream && voiceCallRemoteVideoRef.current) { voiceCallRemoteVideoRef.current.srcObject = remoteStream; void voiceCallRemoteVideoRef.current.play().catch(() => undefined); }
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "connected") { clearVoiceConnectionFailTimer(); setVoiceCallStatus("active"); setVoiceCallError(null); }
      if (peerConnection.connectionState === "failed") endVoiceCall(false, `${voiceCallTypeRef.current === "video" ? "Video" : "Audio"} connection failed. Add a TURN server for this network.`);
      if (peerConnection.connectionState === "disconnected") {
        clearVoiceConnectionFailTimer();
        voiceConnectionFailTimerRef.current = window.setTimeout(() => {
          if (voiceCallPeerConnectionRef.current?.connectionState === "disconnected") endVoiceCall(false, `${voiceCallTypeRef.current === "video" ? "Video" : "Audio"} connection dropped. Add a TURN server for this network.`);
        }, 10000);
      }
      if (peerConnection.connectionState === "closed") endVoiceCall(false, "Call ended.");
    };
    return peerConnection;
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div className={cn("relative z-10 mx-auto grid min-h-screen max-w-[1660px] grid-cols-1 gap-3 p-3 transition-[grid-template-columns] sm:gap-4 sm:p-4", sidebarCollapsed ? "lg:grid-cols-[82px_1fr]" : "lg:grid-cols-[260px_1fr]")}>
        <aside className="rounded-lg border border-white/[0.09] bg-[#101827]/88 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:p-4">
          <div className={cn("mb-3 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3 lg:mb-7 lg:pb-5", sidebarCollapsed && "lg:flex-col lg:items-center lg:gap-2")}>
            <div className={cn("min-w-0", sidebarCollapsed && "lg:sr-only")}>
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/[0.14] bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.04)]">
                  <Image src="/empanada hauz logo.jpg" alt="Empanada Hauz" fill sizes="44px" className="object-cover" priority />
                </div>
                <div className="min-w-0"><p className="text-[11px] uppercase tracking-[0.24em] text-accent">Empanada Hauz</p><h1 className="mt-1 truncate text-lg font-semibold leading-tight">Food Operations</h1></div>
              </div>
            </div>
            {sidebarCollapsed ? <div className="relative hidden h-10 w-10 overflow-hidden rounded-lg border border-white/[0.14] bg-white lg:block"><Image src="/empanada hauz logo.jpg" alt="Empanada Hauz" fill sizes="40px" className="object-cover" priority /></div> : null}
            <button type="button" suppressHydrationWarning onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.06] text-foreground/70 transition hover:border-accent/45 hover:bg-accent/10 hover:text-foreground lg:inline-flex"><ChevronLeft size={17} className={cn("transition", sidebarCollapsed && "rotate-180")} /></button>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-2 lg:overflow-visible lg:px-0 lg:pb-0">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return <Link key={item.href} href={item.href as Route} aria-label={sidebarCollapsed ? item.label : undefined} title={sidebarCollapsed ? item.label : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition lg:gap-3 lg:px-3.5", sidebarCollapsed && "lg:justify-center lg:px-0", active ? "bg-[linear-gradient(135deg,rgb(var(--accent)),#ff8a4d)] text-white shadow-[0_16px_35px_rgb(var(--accent)/0.26)]" : "text-foreground/64 hover:bg-white/[0.07] hover:text-foreground")}><Icon size={17} /><span className={cn(sidebarCollapsed && "lg:sr-only")}>{item.label}</span></Link>;
            })}
          </nav>
        </aside>
        <main className="relative min-w-0 rounded-lg border border-white/[0.04] bg-[#0e1524]/38 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-sm sm:p-4">
          <div className="mb-4 flex justify-end"><div className="flex items-center gap-2">
            {voiceCallOpen && typeof document !== "undefined" ? createPortal(<><div onClick={() => setVoiceCallOpen(false)} className="fixed inset-0 z-[95] bg-black/65 backdrop-blur-[1px]" /><div ref={voiceCallPanelRef} onPointerDown={startPanelDrag} className="fixed z-[96]">{null}</div></>, document.body) : null}
          </div></div>
          {children}
        </main>
      </div>
      <audio ref={voiceCallRemoteAudioRef} autoPlay className="hidden" />
      <audio ref={ringtoneAudioRef} loop src="/ringtone.mp3" className="hidden" />
    </div>
  );
}
