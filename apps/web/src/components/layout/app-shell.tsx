"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft, ClipboardList, FileText, LayoutDashboard, LogOut, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MonitorOff, MonitorUp, ReceiptText, Send, Settings, Share2, ShieldAlert, Truck, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";
import { useRealtimeStore } from "@/store/realtime-store";
import { VOICE_ICE_SERVERS } from "@/lib/config";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: MessageCircle },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/referrals", label: "Referrals", icon: Share2 },
  { href: "/delivery-network", label: "Delivery", icon: Truck },
  { href: "/fraud", label: "Fraud Center", icon: ShieldAlert },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings }
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
      toggleVoiceMute();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [voiceCallBusy]);

  useEffect(() => {
    socket.connect();
    const names = ["orders.updated", "kitchen.updated", "batches.updated", "deliveries.updated", "notifications.created"];
    const handleConnect = () => setRealtimeConnected(true);
    const handleDisconnect = () => setRealtimeConnected(false);
    const handleOperatorChatMessage = (message: OperatorChatMessage) => {
      if (!message?.id || !message.text) {
        return;
      }

      setOperatorChatMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message].slice(-200)));
      if (!communicationsOpenRef.current) {
        setOperatorChatUnread((current) => current + 1);
      }
    };
    const handlers = names.map((name) => {
      const fn = (payload: unknown) => {
        push(name, payload);

        const shouldNotify = shouldAnnounceRealtimeEvent(name, payload, recentNotificationKeysRef.current);
        if (speechEnabled && shouldNotify) {
          speakNotification(name, payload);
        }

        if (browserNotificationsEnabled) {
          showBrowserNotification(name, payload);
        }
      };
      socket.on(name, fn);
      return { name, fn };
    });

    setRealtimeConnected(socket.connected);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("operator.chat.message", handleOperatorChatMessage);

    return () => {
      handlers.forEach(({ name, fn }) => socket.off(name, fn));
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("operator.chat.message", handleOperatorChatMessage);
      socket.disconnect();
    };
  }, [browserNotificationsEnabled, push, speechEnabled]);

  useEffect(() => {
    if (notificationsOpen && unreadCount > 0) {
      markNotificationsRead();
    }
  }, [markNotificationsRead, notificationsOpen, unreadCount]);

  useEffect(() => {
    if (!voiceClientId) {
      return;
    }

    const announcePresence = () => {
      socket.emit("voice.presence", {
        clientId: voiceClientId,
        name: "Empanada Hauz Operator"
      });
    };

    const handleIncomingCall = (payload: VoiceCallSignal) => {
      if (!payload.callId || !payload.from || payload.from === voiceClientId) {
        return;
      }

      if (voiceCallStatusRef.current !== "idle") {
        socket.emit("voice.call.decline", {
          callId: payload.callId,
          from: voiceClientId,
          to: payload.from
        });
        return;
      }

      voiceCallIdRef.current = payload.callId;
      voiceRemoteClientIdRef.current = payload.from;
      const nextCallType = payload.callType === "video" ? "video" : "audio";
      voiceCallTypeRef.current = nextCallType;
      setVoiceCallType(nextCallType);
      setVoicePeerName(payload.name ?? "Operator");
      setVoiceCallError(null);
      setVoiceCallStatus("incoming");
      setVoiceCallOpen(true);
    };

    const handleCallAccepted = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.from || voiceCallStatusRef.current !== "outgoing") {
        return;
      }

      voiceRemoteClientIdRef.current = payload.from;
      setVoiceCallStatus("connecting");
      setVoiceCallError(null);

      try {
        const peerConnection = await createVoicePeerConnection(payload.from);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("voice.call.offer", {
          callId: voiceCallIdRef.current,
          from: voiceClientId,
          to: payload.from,
          description: offer
        });
      } catch {
        endVoiceCall(false, `Unable to start the ${voiceCallTypeRef.current} connection.`);
      }
    };

    const handleCallDeclined = (payload: VoiceCallSignal) => {
      if (isCurrentVoiceCall(payload)) {
        endVoiceCall(false, "The call was declined or the other operator is busy.");
      }
    };

    const handleCallEnded = (payload: VoiceCallSignal) => {
      if (isCurrentVoiceCall(payload)) {
        endVoiceCall(false, "Call ended.");
      }
    };

    const handleCallOffer = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.from || !payload.description) {
        return;
      }

      try {
        voiceRemoteClientIdRef.current = payload.from;
        setVoiceCallStatus("connecting");
        const peerConnection = await createVoicePeerConnection(payload.from);
        await peerConnection.setRemoteDescription(payload.description);
        await flushPendingVoiceIceCandidates(peerConnection);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("voice.call.answer", {
          callId: voiceCallIdRef.current,
          from: voiceClientId,
          to: payload.from,
          description: answer
        });
      } catch {
        endVoiceCall(false, `Unable to accept the ${voiceCallTypeRef.current} call.`);
      }
    };

    const handleCallAnswer = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.description || voiceCallStatusRef.current === "idle") {
        return;
      }

      try {
        const peerConnection = voiceCallPeerConnectionRef.current;
        if (!peerConnection) {
          return;
        }
        await peerConnection.setRemoteDescription(payload.description);
        await flushPendingVoiceIceCandidates(peerConnection);
      } catch {
        endVoiceCall(false, `Unable to establish the ${voiceCallTypeRef.current} call.`);
      }
    };

    const handleCallIce = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.candidate) {
        return;
      }
      await addOrQueueVoiceIceCandidate(payload.candidate);
    };

    socket.on("voice.call.incoming", handleIncomingCall);
    socket.on("voice.call.accepted", handleCallAccepted);
    socket.on("voice.call.declined", handleCallDeclined);
    socket.on("voice.call.ended", handleCallEnded);
    socket.on("voice.call.offer", handleCallOffer);
    socket.on("voice.call.answer", handleCallAnswer);
    socket.on("voice.call.ice", handleCallIce);
    announcePresence();
    return () => {
      socket.off("voice.call.incoming", handleIncomingCall);
      socket.off("voice.call.accepted", handleCallAccepted);
      socket.off("voice.call.declined", handleCallDeclined);
      socket.off("voice.call.ended", handleCallEnded);
      socket.off("voice.call.offer", handleCallOffer);
      socket.off("voice.call.answer", handleCallAnswer);
      socket.off("voice.call.ice", handleCallIce);
    };
  }, [voiceClientId]);

  useEffect(() => {
    const activeCall = window.sessionStorage.getItem("empanada-active-voice-call");
    if (!activeCall || voiceCallStatusRef.current !== "idle") {
      return;
    }

    try {
      const parsed = JSON.parse(activeCall) as { callId?: string; remoteClientId?: string; type?: VoiceCallType; peerName?: string };
      if (!parsed.callId || !parsed.remoteClientId) {
        return;
      }
      voiceCallIdRef.current = parsed.callId;
      voiceRemoteClientIdRef.current = parsed.remoteClientId;
      setVoiceCallType(parsed.type === "video" ? "video" : "audio");
      setVoicePeerName(parsed.peerName ?? "Operator");
      setVoiceCallStatus("connecting");
      setVoiceCallOpen(true);
    } catch {
      window.sessionStorage.removeItem("empanada-active-voice-call");
    }
  }, []);

  useEffect(() => {
    if (sidebarCollapsed) {
      return;
    }

    const navItem = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (navItem) {
      document.title = `${navItem.label} · Empanada Hauz`;
    }
  }, [pathname, sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-card transition-all", sidebarCollapsed ? "w-16" : "w-56")}>
        <div className="flex h-16 items-center justify-between border-b px-3">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <Image src="/logo.svg" alt="Empanada Hauz" width={32} height={32} />
            {!sidebarCollapsed && <span className="font-semibold whitespace-nowrap">Empanada Hauz</span>}
          </Link>
          <button type="button" className="rounded-md p-1.5 hover:bg-muted" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <ChevronLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.label : undefined} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted", active && "bg-muted font-medium")}>
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <button type="button" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted" onClick={logout} title={sidebarCollapsed ? "Logout" : undefined}>
            <LogOut className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
      <main className={cn("min-h-screen transition-all", sidebarCollapsed ? "pl-16" : "pl-56")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", realtimeConnected ? "bg-emerald-500" : "bg-muted-foreground")} title={realtimeConnected ? "Realtime connected" : "Realtime disconnected"} />
            <button type="button" className="relative rounded-md p-2 hover:bg-muted" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-destructive-foreground">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
          </div>
        </header>
        {notificationsOpen && (
          <div className="fixed right-4 top-14 z-50 w-80 rounded-lg border bg-card p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => markNotificationsRead()}>Mark read</button>
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {notifications.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No notifications.</p> : notifications.slice(0, 20).map((item) => <div key={item.id} className={cn("rounded-md border p-2 text-sm", !item.read && "bg-muted/50")}><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.message}</div></div>)}
            </div>
          </div>
        )}
        {children}
      </main>
      {voiceCallOpen && (
        <div ref={voiceCallPanelRef} onPointerDown={startPanelDrag} className="fixed z-[70] w-[min(420px,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-2xl" style={panelPosition ? { left: panelPosition.x, top: panelPosition.y } : { right: 16, bottom: 16 }}>
          <div className="mb-3 flex items-center justify-between">
            <div><div className="font-semibold">{capitalizeCallType(voiceCallType)} call</div><div className="text-sm text-muted-foreground">{voicePeerName}</div></div>
            <div className="flex items-center gap-1">
              {voiceCallType === "video" && <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={toggleVideoFullscreen} aria-label={videoFullscreen ? "Exit fullscreen" : "Fullscreen"}>{videoFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>}
              <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => endVoiceCall(false, "Call ended.")} aria-label="Close"><MonitorOff className="h-4 w-4" /></button>
            </div>
          </div>
          {voiceCallType === "video" && <div ref={voiceCallVideoStageRef} className="mb-3 aspect-video overflow-hidden rounded-lg bg-black"><video ref={voiceCallRemoteVideoRef} className="h-full w-full object-cover" autoPlay playsInline /><video ref={voiceCallLocalVideoRef} className="absolute bottom-6 right-6 h-24 w-32 rounded-md object-cover" autoPlay muted playsInline /></div>}
          <audio ref={voiceCallRemoteAudioRef} autoPlay />
          {voiceCallError && <p className="mb-3 text-sm text-destructive">{voiceCallError}</p>}
          {voiceCallStatus === "incoming" ? (
            <div className="flex gap-2"><button type="button" className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={acceptIncomingVoiceCall}>Accept</button><button type="button" className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => declineIncomingVoiceCall()}>Decline</button></div>
          ) : (
            <div className="flex items-center justify-between gap-2"><button type="button" className={cn("rounded-md px-3 py-2 text-sm", voiceMuted ? "bg-destructive text-destructive-foreground" : "border")} onClick={toggleVoiceMute}>{voiceMuted ? <MicOff className="mr-1 inline h-4 w-4" /> : <Mic className="mr-1 inline h-4 w-4" />}{voiceMuted ? "Unmute" : "Mute"}</button>{voiceCallType === "video" && <button type="button" className={cn("rounded-md px-3 py-2 text-sm", videoMuted ? "bg-destructive text-destructive-foreground" : "border")} onClick={toggleVideoMute}>{videoMuted ? <VideoOff className="mr-1 inline h-4 w-4" /> : <Video className="mr-1 inline h-4 w-4" />}{videoMuted ? "Camera on" : "Camera off"}</button>} {voiceCallType === "video" && <button type="button" className={cn("rounded-md px-3 py-2 text-sm", screenSharing ? "bg-primary text-primary-foreground" : "border")} onClick={() => void toggleScreenShare()}>{screenSharing ? <MonitorOff className="mr-1 inline h-4 w-4" /> : <MonitorUp className="mr-1 inline h-4 w-4" />}{screenSharing ? "Stop share" : "Share"}</button>}<button type="button" className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground" onClick={() => endVoiceCall(false, "Call ended.")}>End</button></div>
          )}
        </div>
      )}
    </div>
  );
}
