"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft, ClipboardList, LayoutDashboard, LogOut, Maximize2, MessageCircle, Mic, MicOff, Minimize2, MonitorOff, MonitorUp, ReceiptText, Send, Share2, Truck, Video, VideoOff } from "lucide-react";
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
      // On the very first render voiceCallStatus is "idle" by default,
      // before the restore-on-reload effect (a few renders later) has had
      // a chance to read sessionStorage. Without this guard, that initial
      // "idle" render wipes the persisted call before it can ever be
      // resumed. Only actually clear storage once we've observed a real
      // busy status at least once this session.
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

    const handleOffer = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.from || !payload.description) {
        return;
      }

      try {
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
        setVoiceCallStatus("connecting");
      } catch {
        endVoiceCall(true, `Unable to answer the ${voiceCallTypeRef.current} call.`);
      }
    };

    const handleAnswer = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.description || !voiceCallPeerConnectionRef.current) {
        return;
      }

      try {
        await voiceCallPeerConnectionRef.current.setRemoteDescription(payload.description);
        await flushPendingVoiceIceCandidates(voiceCallPeerConnectionRef.current);
        setVoiceCallStatus("connecting");
      } catch {
        endVoiceCall(true, `Unable to connect the ${voiceCallTypeRef.current} call.`);
      }
    };

    const handleIce = async (payload: VoiceCallSignal) => {
      if (!isCurrentVoiceCall(payload) || !payload.candidate) {
        return;
      }

      await addOrQueueVoiceIceCandidate(payload.candidate);
    };

    const handleClientJoined = async (payload: { clientId?: string; name?: string }) => {
      const isSameActiveCallPeer =
        payload?.clientId &&
        payload.clientId === voiceRemoteClientIdRef.current &&
        (voiceCallStatusRef.current === "active" || voiceCallStatusRef.current === "connecting") &&
        voiceCallIdRef.current;

      if (!isSameActiveCallPeer) {
        return;
      }

      // Our call partner's tab just (re)announced itself, most likely because
      // they refreshed mid-call. Tear down the now-stale connection and
      // re-offer using the same callId so their reload can pick it back up.
      const stalePeerConnection = voiceCallPeerConnectionRef.current;
      voiceCallPeerConnectionRef.current = null;
      if (stalePeerConnection) {
        stalePeerConnection.onicecandidate = null;
        stalePeerConnection.ontrack = null;
        stalePeerConnection.onconnectionstatechange = null;
        stalePeerConnection.close();
      }

      try {
        const peerConnection = await createVoicePeerConnection(payload.clientId!);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("voice.call.offer", {
          callId: voiceCallIdRef.current,
          from: voiceClientId,
          to: payload.clientId,
          description: offer
        });
        setVoiceCallStatus("connecting");
      } catch {
        endVoiceCall(false, "Lost connection to the other operator.");
      }
    };

    const storedCallRaw = window.sessionStorage.getItem("empanada-active-voice-call");
    if (storedCallRaw && voiceCallStatusRef.current === "idle") {
      try {
        const storedCall = JSON.parse(storedCallRaw) as {
          callId: string;
          remoteClientId: string;
          type: VoiceCallType;
          peerName: string;
        };
        if (storedCall.callId && storedCall.remoteClientId) {
          voiceCallIdRef.current = storedCall.callId;
          voiceRemoteClientIdRef.current = storedCall.remoteClientId;
          voiceCallTypeRef.current = storedCall.type === "video" ? "video" : "audio";
          setVoiceCallType(voiceCallTypeRef.current);
          setVoicePeerName(storedCall.peerName || "Operator");
          setVoiceCallStatus("connecting");
          setVoiceCallError(null);
          setVoiceCallOpen(true);

          const resumeTimeout = window.setTimeout(() => {
            if (voiceCallStatusRef.current === "connecting") {
              endVoiceCall(true, "Couldn't reconnect the call after refresh.");
            }
          }, 20000);

          const clearResumeTimeout = () => window.clearTimeout(resumeTimeout);
          socket.once("voice.call.offer", clearResumeTimeout);
          socket.once("voice.call.ended", clearResumeTimeout);
        }
      } catch {
        window.sessionStorage.removeItem("empanada-active-voice-call");
      }
    }

    announcePresence();
    socket.on("connect", announcePresence);
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

    if (!voiceCallStreamRef.current) {
      voiceCallStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: callType === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false
      });
      setVoiceCallAudioEnabled(!voiceMutedRef.current);
    }

    if (callType === "video" && voiceCallStreamRef.current.getVideoTracks().length === 0) {
      stopVoiceCallStream(voiceCallStreamRef.current);
      voiceCallStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
      });
      setVoiceCallAudioEnabled(!voiceMutedRef.current);
    }

    if (voiceCallLocalVideoRef.current) {
      voiceCallLocalVideoRef.current.srcObject = voiceCallStreamRef.current;
      void voiceCallLocalVideoRef.current.play().catch(() => undefined);
    }

    return voiceCallStreamRef.current;
  }

  function toggleVoiceMute() {
    if (!voiceCallBusy) {
      return;
    }

    setVoiceMuted((current) => !current);
  }

  function toggleVideoMute() {
    if (!voiceCallBusy || voiceCallTypeRef.current !== "video") {
      return;
    }

    setVideoMuted((current) => !current);
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

  async function toggleScreenShare() {
    if (!voiceCallBusy || voiceCallTypeRef.current !== "video") {
      return;
    }

    const peerConnection = voiceCallPeerConnectionRef.current;

    if (screenSharing) {
      const cameraTrack = voiceCallStreamRef.current?.getVideoTracks()[0] ?? null;
      const sender = peerConnection?.getSenders().find((item) => item.track?.kind === "video");
      if (sender && cameraTrack) {
        await sender.replaceTrack(cameraTrack);
      }
      if (voiceCallLocalVideoRef.current && voiceCallStreamRef.current) {
        voiceCallLocalVideoRef.current.srcObject = voiceCallStreamRef.current;
        void voiceCallLocalVideoRef.current.play().catch(() => undefined);
      }
      voiceCallScreenStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceCallScreenStreamRef.current = null;
      setScreenSharing(false);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setVoiceCallError("Screen sharing isn't supported in this browser.");
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      voiceCallScreenStreamRef.current = screenStream;

      const sender = peerConnection?.getSenders().find((item) => item.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }

      if (voiceCallLocalVideoRef.current) {
        voiceCallLocalVideoRef.current.srcObject = screenStream;
        void voiceCallLocalVideoRef.current.play().catch(() => undefined);
      }

      // The browser's own "Stop sharing" control ends the track directly,
      // so react to that the same way as our own toggle button.
      screenTrack.onended = () => {
        void toggleScreenShare();
      };

      setScreenSharing(true);
    } catch {
      setVoiceCallError("Screen sharing permission was blocked or cancelled.");
    }
  }

  function toggleVideoFullscreen() {
    const stage = voiceCallVideoStageRef.current;
    if (!stage) {
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen();
    }
  }

  function startPanelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, input, a")) {
      return;
    }

    const panel = voiceCallPanelRef.current;
    if (!panel) {
      return;
    }

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
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch {
        continue;
      }
    }
  }

  async function createVoicePeerConnection(remoteClientId: string) {
    if (voiceCallPeerConnectionRef.current) {
      return voiceCallPeerConnectionRef.current;
    }

    const localStream = await ensureVoiceCallStream(voiceCallTypeRef.current);
    const peerConnection = new RTCPeerConnection(VOICE_CALL_CONFIGURATION);
    voiceCallPeerConnectionRef.current = peerConnection;

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice.call.ice", {
          callId: voiceCallIdRef.current,
          from: voiceClientId,
          to: remoteClientId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        voiceCallRemoteStreamRef.current = remoteStream;
      }
      if (remoteStream && voiceCallRemoteAudioRef.current) {
        voiceCallRemoteAudioRef.current.srcObject = remoteStream;
        void voiceCallRemoteAudioRef.current.play().catch(() => undefined);
      }
      if (remoteStream && voiceCallRemoteVideoRef.current) {
        voiceCallRemoteVideoRef.current.srcObject = remoteStream;
        void voiceCallRemoteVideoRef.current.play().catch(() => undefined);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "connected") {
        clearVoiceConnectionFailTimer();
        setVoiceCallStatus("active");
        setVoiceCallError(null);
      }

      if (peerConnection.connectionState === "failed") {
        endVoiceCall(false, `${capitalizeCallType(voiceCallTypeRef.current)} connection failed. Add a TURN server for this network.`);
      }

      if (peerConnection.connectionState === "disconnected") {
        clearVoiceConnectionFailTimer();
        voiceConnectionFailTimerRef.current = window.setTimeout(() => {
          if (voiceCallPeerConnectionRef.current?.connectionState === "disconnected") {
            endVoiceCall(false, `${capitalizeCallType(voiceCallTypeRef.current)} connection dropped. Add a TURN server for this network.`);
          }
        }, 10000);
      }

      if (peerConnection.connectionState === "closed") {
        endVoiceCall(false, "Call ended.");
      }
    };

    return peerConnection;
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div
        className={cn(
          "relative z-10 mx-auto grid min-h-screen max-w-[1660px] grid-cols-1 gap-3 p-3 transition-[grid-template-columns] sm:gap-4 sm:p-4",
          sidebarCollapsed ? "lg:grid-cols-[82px_1fr]" : "lg:grid-cols-[260px_1fr]"
        )}
      >
        <aside className="rounded-lg border border-white/[0.09] bg-[#101827]/88 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:p-4">
          <div className={cn("mb-3 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3 lg:mb-7 lg:pb-5", sidebarCollapsed && "lg:flex-col lg:items-center lg:gap-2")}>
            <div className={cn("min-w-0", sidebarCollapsed && "lg:sr-only")}>
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/[0.14] bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.04)]">
                  <Image
                    src="/empanada hauz logo.jpg"
                    alt="Empanada Hauz"
                    fill
                    sizes="44px"
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-accent">Empanada Hauz</p>
                  <h1 className="mt-1 truncate text-lg font-semibold leading-tight">Food Operations</h1>
                </div>
              </div>
            </div>
            {sidebarCollapsed ? (
              <div className="relative hidden h-10 w-10 overflow-hidden rounded-lg border border-white/[0.14] bg-white lg:block">
                <Image src="/empanada hauz logo.jpg" alt="Empanada Hauz" fill sizes="40px" className="object-cover" priority />
              </div>
            ) : null}
            <button
              type="button"
              suppressHydrationWarning
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.06] text-foreground/70 transition hover:border-accent/45 hover:bg-accent/10 hover:text-foreground lg:inline-flex"
            >
              <ChevronLeft size={17} className={cn("transition", sidebarCollapsed && "rotate-180")} />
            </button>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-2 lg:overflow-visible lg:px-0 lg:pb-0">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition lg:gap-3 lg:px-3.5",
                    sidebarCollapsed && "lg:justify-center lg:px-0",
                    active
                      ? "bg-[linear-gradient(135deg,rgb(var(--accent)),#ff8a4d)] text-white shadow-[0_16px_35px_rgb(var(--accent)/0.26)]"
                      : "text-foreground/64 hover:bg-white/[0.07] hover:text-foreground"
                  )}
                >
                  <Icon size={17} />
                  <span className={cn(sidebarCollapsed && "lg:sr-only")}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="relative min-w-0 rounded-lg border border-white/[0.04] bg-[#0e1524]/38 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-sm sm:p-4">
          <div className="mb-4 flex justify-end">
            <div className="flex items-center gap-2">
              {voiceCallOpen && typeof document !== "undefined"
                ? createPortal(
                    <>
                      <div
                        onClick={() => setVoiceCallOpen(false)}
                        className="fixed inset-0 z-[95] bg-black/65 backdrop-blur-[1px]"
                      />
                      <div
                    ref={voiceCallPanelRef}
                    onClick={(event) => event.stopPropagation()}
                    style={
                      panelPosition
                        ? { position: "fixed", left: panelPosition.x, top: panelPosition.y, right: "auto" }
                        : { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
                    }
                    className={cn(
                      "z-[100] flex max-h-[calc(100vh-3rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-white/[0.16] bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.72)]",
                      voiceCallType === "video" && voiceCallBusy
                        ? chatOpen
                          ? "max-w-[880px]"
                          : "max-w-[640px]"
                        : "max-w-[420px]"
                    )}
                  >
                    <div
                      onPointerDown={startPanelDrag}
                      className="flex shrink-0 cursor-grab items-center justify-between gap-3 border-b border-white/10 bg-[#111827] px-4 py-3 active:cursor-grabbing"
                    >
                      <div className="select-none">
                        <h3 className="text-sm font-semibold text-white">Communications</h3>
                        <p className="text-[11px] text-white/45">{realtimeConnected ? "Realtime connected" : "Realtime disconnected"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          suppressHydrationWarning
                          onClick={() => setChatOpen((value) => !value)}
                          aria-label={chatOpen ? "Hide chat" : "Show chat"}
                          title={chatOpen ? "Hide chat" : "Show chat"}
                          className={cn(
                            "relative inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition",
                            chatOpen
                              ? "border-accent/45 bg-accent/18 text-white"
                              : "border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
                          )}
                        >
                          <MessageCircle size={13} />
                          Chat
                          {!chatOpen && operatorChatUnread > 0 ? (
                            <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-[9px] font-semibold text-white">
                              {operatorChatUnread > 9 ? "9+" : operatorChatUnread}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          suppressHydrationWarning
                          onClick={() => setVoiceCallOpen(false)}
                          className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.1] hover:text-white"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:min-w-0">
                        <div
                          className={cn(
                            "rounded-md border px-2.5 py-2 text-xs font-medium",
                            voiceCallActive
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100/85"
                              : voiceCallError
                              ? "border-rose-400/25 bg-rose-400/10 text-rose-100/85"
                              : voiceCallStatus === "incoming"
                              ? "border-sky-400/25 bg-sky-400/10 text-sky-100/85"
                              : "border-white/10 bg-black/15 text-white/60"
                          )}
                        >
                          {voiceCallError ?? formatVoiceCallStatus(voiceCallStatus, voicePeerName, voiceCallType)}
                        </div>
                        {voiceCallType === "video" && voiceCallBusy ? (
                          <div
                            ref={voiceCallVideoStageRef}
                            style={videoFullscreen ? undefined : { aspectRatio: "16 / 9" }}
                            className={cn(
                              "group relative shrink-0 overflow-hidden rounded-md border border-white/10 bg-black",
                              videoFullscreen ? "h-screen w-screen" : "max-h-[560px] w-full"
                            )}
                          >
                            <video ref={voiceCallRemoteVideoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
                            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/75">Remote</span>
                            <button
                              type="button"
                              suppressHydrationWarning
                              onClick={toggleVideoFullscreen}
                              aria-label={videoFullscreen ? "Exit fullscreen" : "Fullscreen"}
                              title={videoFullscreen ? "Exit fullscreen" : "Fullscreen"}
                              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white/75 transition hover:bg-black/80 hover:text-white"
                            >
                              {videoFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                            </button>
                            <div
                              className={cn(
                                "absolute overflow-hidden rounded-md border border-white/20 bg-black shadow-lg",
                                videoFullscreen ? "bottom-4 right-4 h-32 w-44" : "bottom-2 right-2 h-20 w-28 sm:h-24 sm:w-32"
                              )}
                            >
                              {videoMuted ? (
                                <div className="flex h-full w-full items-center justify-center bg-black/80">
                                  <VideoOff size={16} className="text-white/40" />
                                </div>
                              ) : (
                                <video ref={voiceCallLocalVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                              )}
                              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white/75">
                                {screenSharing ? "Your screen" : "You"}
                              </span>
                            </div>
                          </div>
                        ) : null}
                        {voiceCallBusy && voiceCallStatus !== "incoming" ? (
                          <div className={cn("grid gap-2", voiceCallType === "video" ? "grid-cols-3" : "grid-cols-1")}>
                            <button
                              type="button"
                              suppressHydrationWarning
                              onClick={toggleVoiceMute}
                              className={cn(
                                "inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition",
                                voiceMuted
                                  ? "border-amber-300/45 bg-amber-300/12 text-amber-100 hover:bg-amber-300/18"
                                  : "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.1]"
                              )}
                            >
                              {voiceMuted ? <MicOff size={16} /> : <Mic size={16} />}
                              <span className="hidden sm:inline">{voiceMuted ? "Unmute" : "Mute"}</span>
                            </button>
                            {voiceCallType === "video" ? (
                              <button
                                type="button"
                                suppressHydrationWarning
                                onClick={toggleVideoMute}
                                disabled={screenSharing}
                                className={cn(
                                  "inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                                  videoMuted
                                    ? "border-amber-300/45 bg-amber-300/12 text-amber-100 hover:bg-amber-300/18"
                                    : "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.1]"
                                )}
                              >
                                {videoMuted ? <VideoOff size={16} /> : <Video size={16} />}
                                <span className="hidden sm:inline">{videoMuted ? "Start Video" : "Stop Video"}</span>
                              </button>
                            ) : null}
                            {voiceCallType === "video" ? (
                              <button
                                type="button"
                                suppressHydrationWarning
                                onClick={() => void toggleScreenShare()}
                                className={cn(
                                  "inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition",
                                  screenSharing
                                    ? "border-sky-300/45 bg-sky-300/12 text-sky-100 hover:bg-sky-300/18"
                                    : "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.1]"
                                )}
                              >
                                {screenSharing ? <MonitorOff size={16} /> : <MonitorUp size={16} />}
                                <span className="hidden sm:inline">{screenSharing ? "Stop Sharing" : "Share Screen"}</span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {voiceCallStatus === "incoming" ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              suppressHydrationWarning
                              onClick={acceptVoiceCall}
                              className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-400/45 bg-emerald-400/12 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                            >
                              {voiceCallType === "video" ? <Video size={16} /> : <Mic size={16} />}
                              Accept
                            </button>
                            <button
                              type="button"
                              suppressHydrationWarning
                              onClick={declineVoiceCall}
                              className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-400/45 bg-rose-400/12 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/18"
                            >
                              <MicOff size={16} />
                              Decline
                            </button>
                          </div>
                        ) : (
                          voiceCallBusy ? (
                            <button
                              type="button"
                              suppressHydrationWarning
                              onClick={() => endVoiceCall(true)}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-400/45 bg-rose-400/12 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/18"
                            >
                              {voiceCallType === "video" ? <VideoOff size={16} /> : <MicOff size={16} />}
                              End call
                            </button>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                suppressHydrationWarning
                                onClick={() => void startVoiceCall("audio")}
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-400/45 bg-emerald-400/12 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/18"
                              >
                                <Mic size={16} />
                                Audio
                              </button>
                              <button
                                type="button"
                                suppressHydrationWarning
                                onClick={() => void startVoiceCall("video")}
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-400/45 bg-sky-400/12 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/18"
                              >
                                <Video size={16} />
                                Video
                              </button>
                            </div>
                          )
                        )}
                      </div>
                      {chatOpen ? (
                        <div className="flex w-full shrink-0 flex-col border-t border-white/10 sm:max-h-[calc(100vh-9rem)] sm:w-[300px] sm:border-l sm:border-t-0">
                          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/52">Chat</h4>
                            <span className="text-[11px] text-white/35">{operatorChatMessages.length} messages</span>
                          </div>
                          <div className="max-h-[45vh] min-h-[160px] space-y-2 overflow-y-auto p-3 sm:max-h-[calc(100vh-14rem)]">
                            {operatorChatMessages.length === 0 ? (
                              <p className="py-10 text-center text-sm text-white/45">No chat messages yet.</p>
                            ) : null}
                            {operatorChatMessages.map((message) => {
                              const mine = message.from === voiceClientId;
                              return (
                                <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                  <div
                                    className={cn(
                                      "max-w-[92%] rounded-lg border px-3 py-2 text-sm shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
                                      mine
                                        ? "border-accent/35 bg-accent/18 text-white"
                                        : "border-white/12 bg-white/[0.07] text-white/82"
                                    )}
                                  >
                                    <div className="mb-1 flex items-center justify-between gap-3">
                                      <span className="truncate text-[11px] font-semibold text-white/50">{mine ? "You" : message.name}</span>
                                      <span className="shrink-0 text-[10px] text-white/35">{formatChatTime(message.createdAt)}</span>
                                    </div>
                                    <p className="whitespace-pre-wrap break-words leading-5">{message.text}</p>
                                  </div>
                                </div>
                              );
                            })}
                            <div ref={operatorChatMessagesEndRef} />
                          </div>
                          <form onSubmit={sendOperatorChatMessage} className="flex shrink-0 gap-2 border-t border-white/10 p-3">
                            <input
                              value={operatorChatDraft}
                              onChange={(event) => setOperatorChatDraft(event.target.value)}
                              placeholder={realtimeConnected ? "Message operators" : "Realtime disconnected"}
                              disabled={!realtimeConnected}
                              maxLength={1000}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#101827]/80 px-3 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-accent/70 disabled:cursor-not-allowed disabled:opacity-55"
                            />
                            <button
                              type="submit"
                              suppressHydrationWarning
                              disabled={!operatorChatDraft.trim() || !realtimeConnected}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/45 bg-accent/15 text-accent transition hover:bg-accent/22 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Send chat message"
                              title="Send"
                            >
                              <Send size={16} />
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </div>
                      </>,
                      document.body
                    )
                  : null}
              <div className="relative">
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setNotificationsOpen((value) => !value)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.09] bg-panel/80 shadow-lg shadow-black/15 transition hover:bg-white/[0.08]"
              >
                <Bell size={18} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className="absolute right-0 top-12 z-[100] w-[calc(100vw-1.5rem)] max-w-[390px] rounded-lg border border-white/[0.16] bg-[#111827] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.72)]">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Notifications</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        suppressHydrationWarning
                        onClick={toggleBrowserNotifications}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition",
                          browserNotificationsEnabled
                            ? "border-sky-400/45 bg-sky-400/12 text-sky-100 hover:bg-sky-400/18"
                            : "border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white"
                        )}
                      >
                        {browserNotificationsEnabled ? "Push on" : "Push off"}
                      </button>
                      <button
                        type="button"
                        suppressHydrationWarning
                        onClick={toggleSpeech}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition",
                          speechEnabled
                            ? "border-violet-300/45 bg-violet-300/12 text-violet-100 hover:bg-violet-300/18"
                            : "border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white"
                        )}
                      >
                        {speechEnabled ? "TTS on" : "TTS off"}
                      </button>
                      <button
                        type="button"
                        suppressHydrationWarning
                        onClick={() => {
                          speakText("Test notification.");
                        }}
                        className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/[0.1] hover:text-white"
                      >
                        Test TTS
                      </button>
                      <span className="text-xs text-white/55">{notifications.length} total</span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mb-2 rounded-md border px-2.5 py-1.5 text-[11px] font-medium",
                      realtimeConnected
                        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100/80"
                        : "border-rose-400/25 bg-rose-400/10 text-rose-100/80"
                    )}
                  >
                    Realtime {realtimeConnected ? "connected" : "disconnected"}
                  </div>
                  <div className="mb-3 rounded-md border border-white/10 bg-black/15 px-2.5 py-1.5 text-[11px] text-white/55">
                    Browser notifications {browserNotificationPermission === "denied" ? "blocked by browser" : browserNotificationsEnabled ? "enabled" : "disabled"} · Speech {speechEnabled ? "enabled" : "disabled"}
                  </div>
                  <div className="max-h-[420px] space-y-3 overflow-y-auto">
                    {notifications.length === 0 ? <p className="text-sm text-white/60">No notifications yet.</p> : null}
                    {notifications.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/[0.14] bg-[#0b1220] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.32)]">
                        <p className="text-sm font-semibold text-white">{formatNotificationTitle(item.type)}</p>
                        <p className="mt-1 text-xs leading-5 text-white/68">{formatNotificationMessage(item.payload)}</p>
                        <p className="mt-2 text-[11px] text-white/45">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              </div>
              <button
                type="button"
                suppressHydrationWarning
                onClick={logout}
                aria-label="Logout"
                title="Logout"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.09] bg-panel/80 shadow-lg shadow-black/15 transition hover:bg-white/[0.08]"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          {children}
          <audio ref={voiceCallRemoteAudioRef} autoPlay playsInline />
          <audio ref={ringtoneAudioRef} src="/IPhone%20original%20ringtone.mp3" loop preload="auto" />
        </main>
      </div>
      {typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setVoiceCallOpen((value) => !value)}
              aria-label="Open communications"
              title="Communications"
              className={cn(
                "fixed bottom-6 right-6 z-[90] inline-flex h-16 w-16 items-center justify-center rounded-full border shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur transition hover:scale-105",
                voiceCallOpen || voiceCallBusy
                  ? "border-sky-400/55 bg-sky-400/22 text-sky-100 hover:bg-sky-400/28"
                  : "border-white/[0.12] bg-panel/90 text-foreground/85 hover:bg-white/[0.1]"
              )}
            >
              <MessageCircle size={26} />
              {voiceCallBusy ? (
                <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
              ) : null}
              {operatorChatUnread > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">
                  {operatorChatUnread > 9 ? "9+" : operatorChatUnread}
                </span>
              ) : null}
            </button>,
            document.body
          )
        : null}
    </div>
  );
}

function formatNotificationTitle(type: string) {
  if (type === "order.created") {
    return "New order created";
  }

  if (type === "orders.updated") {
    return "Order updated";
  }

  if (type === "kitchen.updated") {
    return "Kitchen update";
  }

  if (type === "deliveries.updated") {
    return "Delivery update";
  }

  if (type === "batches.updated") {
    return "Batch update";
  }

  if (type === "notifications.enabled") {
    return "Browser notifications enabled";
  }

  if (type === "order.schedule_reminder") {
    return "Upcoming order schedule";
  }

  return type.replaceAll("_", " ").replaceAll(".", " ");
}

function formatNotificationMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return "New system notification.";
  }

  const value = payload as {
    customerName?: string;
    orderNumber?: string;
    minutesUntilSchedule?: number;
    scheduledFor?: string;
    quantity?: number;
    status?: string;
    id?: string;
    orderId?: string;
    message?: string;
    customer?: {
      name?: string;
    };
    name?: string;
  };

  if (value.message) {
    return value.message;
  }

  if (value.customerName && value.orderNumber && typeof value.quantity === "number") {
    return `${value.customerName} (${value.orderNumber}) ordered ${value.quantity} pc${value.quantity === 1 ? "" : "s"}.`;
  }

  if (value.customerName && value.orderNumber && typeof value.minutesUntilSchedule === "number") {
    return `${value.customerName} (${value.orderNumber}) is scheduled in ${value.minutesUntilSchedule} minute${value.minutesUntilSchedule === 1 ? "" : "s"}.`;
  }

  const customerName = value.customerName ?? value.customer?.name;
  if (customerName && value.orderNumber && value.status) {
    return `${customerName} (${value.orderNumber}) is now ${formatStatus(value.status)}.`;
  }

  if (value.orderNumber && value.status) {
    return `${value.orderNumber} is now ${formatStatus(value.status)}.`;
  }

  if (value.orderId && value.status) {
    return `Order ${value.orderId} is now ${formatStatus(value.status)}.`;
  }

  if (value.name) {
    return value.status ? `${value.name} is now ${formatStatus(value.status)}.` : `${value.name} was updated.`;
  }

  return JSON.stringify(payload);
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatChatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function clampNumber(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function formatVoiceCallStatus(status: VoiceCallStatus, peerName: string, callType: VoiceCallType) {
  const label = callType === "video" ? "video" : "audio";

  if (status === "incoming") {
    return `${peerName} is starting a ${label} call.`;
  }

  if (status === "outgoing") {
    return "Calling available operators...";
  }

  if (status === "connecting") {
    return `Connecting ${label}...`;
  }

  if (status === "active") {
    return `Live ${label} call with ${peerName}.`;
  }

  return "Start a live call with another open dashboard.";
}

function capitalizeCallType(callType: VoiceCallType) {
  return callType === "video" ? "Video" : "Audio";
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function showBrowserNotification(name: string, payload: unknown) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const type = name === "notifications.created" && isObject(payload) && typeof payload.type === "string" ? payload.type : name;
  const notificationPayload = name === "notifications.created" && isObject(payload) && "payload" in payload ? payload.payload : payload;
  const title = formatNotificationTitle(type);
  const body = formatNotificationMessage(notificationPayload);
  const tag = getRealtimeNotificationKey(name, payload) ?? `${type}-${Date.now()}`;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/empanada hauz logo.jpg",
      badge: "/empanada hauz logo.jpg",
      tag
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    return;
  }
}

function speakNotification(name: string, payload: unknown) {
  const type = name === "notifications.created" && isObject(payload) && typeof payload.type === "string" ? payload.type : name;
  const notificationPayload = name === "notifications.created" && isObject(payload) && "payload" in payload ? payload.payload : payload;
  speakText(`${formatNotificationTitle(type)}. ${formatNotificationSpeechMessage(notificationPayload)}`);
}

function formatNotificationSpeechMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return "New system notification.";
  }

  const value = payload as {
    customerName?: string;
    orderNumber?: string;
    minutesUntilSchedule?: number;
    quantity?: number;
    status?: string;
    message?: string;
    customer?: {
      name?: string;
    };
    order?: {
      customer?: {
        name?: string;
      };
    };
    name?: string;
  };
  const customerName = value.customerName ?? value.customer?.name ?? value.order?.customer?.name ?? value.name;

  if (value.message) {
    return value.message;
  }

  if (customerName && typeof value.quantity === "number") {
    return `${customerName} ordered ${value.quantity} pc${value.quantity === 1 ? "" : "s"}.`;
  }

  if (customerName && typeof value.minutesUntilSchedule === "number") {
    return `${customerName} is scheduled in ${value.minutesUntilSchedule} minute${value.minutesUntilSchedule === 1 ? "" : "s"}.`;
  }

  if (customerName && value.status) {
    return `${customerName} is now ${formatStatus(value.status)}.`;
  }

  if (customerName) {
    return `${customerName} was updated.`;
  }

  if (value.status) {
    return `Order status is now ${formatStatus(value.status)}.`;
  }

  return "New notification.";
}

function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return;
  }

  const normalized = text.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!normalized) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(normalized);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    return;
  }
}

function shouldAnnounceRealtimeEvent(name: string, payload: unknown, recentNotificationKeys: Map<string, number>) {
  const notificationKey = getRealtimeNotificationKey(name, payload);
  if (!notificationKey) {
    return false;
  }

  const now = Date.now();
  for (const [key, timestamp] of recentNotificationKeys) {
    if (now - timestamp > 5000) {
      recentNotificationKeys.delete(key);
    }
  }

  if (recentNotificationKeys.has(notificationKey)) {
    return false;
  }

  recentNotificationKeys.set(notificationKey, now);
  return true;
}

function getRealtimeNotificationKey(name: string, payload: unknown) {
  if (name === "notifications.created" && isObject(payload)) {
    const type = typeof payload.type === "string" ? payload.type : "notification";
    const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : String(Date.now());
    const notificationPayload = isObject(payload.payload) ? payload.payload : null;
    const orderId = notificationPayload && typeof notificationPayload.orderId === "string" ? notificationPayload.orderId : undefined;

    return orderId ? `order:${orderId}` : `notification:${type}:${createdAt}`;
  }

  if (["orders.updated", "kitchen.updated", "batches.updated", "deliveries.updated"].includes(name)) {
    return getActionEventKey(name, payload);
  }

  return null;
}

function getActionEventKey(name: string, payload: unknown) {
  if (!isObject(payload)) {
    return `${name}:${Date.now()}`;
  }

  const id = typeof payload.orderId === "string"
    ? payload.orderId
    : typeof payload.id === "string"
    ? payload.id
    : typeof payload.orderNumber === "string"
    ? payload.orderNumber
    : undefined;
  const version = typeof payload.updatedAt === "string"
    ? payload.updatedAt
    : typeof payload.status === "string"
    ? payload.status
    : Date.now();

  return id ? `${name}:${id}:${version}` : `${name}:${version}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stopVoiceCallStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
