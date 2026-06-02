"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, Bike, Boxes, ChevronLeft, ClipboardList, CookingPot, Inbox, LayoutDashboard, Package, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { socket } from "@/lib/socket";
import { useRealtimeStore } from "@/store/realtime-store";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/batches", label: "Batches", icon: Boxes },
  { href: "/kitchen", label: "Kitchen", icon: CookingPot },
  { href: "/deliveries", label: "Deliveries", icon: Truck },
  { href: "/delivery-network", label: "Riders", icon: Bike },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/inventory", label: "Inventory", icon: Package }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const push = useRealtimeStore((state) => state.push);
  const notifications = useRealtimeStore((state) => state.notifications);
  const markNotificationsRead = useRealtimeStore((state) => state.markNotificationsRead);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const latestNotificationId = notifications[0]?.id;
  const previousNotificationIdRef = useRef<string | undefined>(undefined);
  const unreadCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    const stored = window.localStorage.getItem("empanada-notification-sound");
    if (stored === "off") {
      setSoundEnabled(false);
    }

    setSidebarCollapsed(window.localStorage.getItem("empanada-sidebar-collapsed") === "true");
  }, []);

  useEffect(() => {
    socket.connect();
    const names = ["orders.updated", "kitchen.updated", "batches.updated", "deliveries.updated", "notifications.created"];
    const handlers = names.map((name) => {
      const fn = (payload: unknown) => push(name, payload);
      socket.on(name, fn);
      return { name, fn };
    });

    return () => {
      handlers.forEach(({ name, fn }) => socket.off(name, fn));
      socket.disconnect();
    };
  }, [push]);

  useEffect(() => {
    if (notificationsOpen && unreadCount > 0) {
      markNotificationsRead();
    }
  }, [markNotificationsRead, notificationsOpen, unreadCount]);

  useEffect(() => {
    if (!latestNotificationId) {
      return;
    }

    if (previousNotificationIdRef.current !== latestNotificationId) {
      previousNotificationIdRef.current = latestNotificationId;
      if (soundEnabled) {
        playNotificationSound();
      }
    }
  }, [latestNotificationId, soundEnabled]);

  function toggleSound() {
    setSoundEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("empanada-notification-sound", next ? "on" : "off");
      return next;
    });
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("empanada-sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className={cn(
          "mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-3 p-3 transition-[grid-template-columns] sm:gap-4 sm:p-4",
          sidebarCollapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[240px_1fr]"
        )}
      >
        <aside className="rounded-lg border border-line/80 bg-panel/95 p-3 shadow-sm shadow-black/10 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:p-4">
          <div className={cn("mb-3 flex items-center justify-between gap-3 border-b border-line/70 pb-3 lg:mb-7 lg:pb-5", sidebarCollapsed && "lg:flex-col lg:items-center lg:gap-2")}>
            <div className={cn("min-w-0", sidebarCollapsed && "lg:sr-only")}>
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line/80 bg-white">
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
                  <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/42">Empanada Hauz</p>
                  <h1 className="mt-1 truncate text-lg font-semibold leading-tight">Food Operations</h1>
                </div>
              </div>
            </div>
            {sidebarCollapsed ? (
              <div className="relative hidden h-10 w-10 overflow-hidden rounded-lg border border-line/80 bg-white lg:block">
                <Image src="/empanada hauz logo.jpg" alt="Empanada Hauz" fill sizes="40px" className="object-cover" priority />
              </div>
            ) : null}
            <button
              type="button"
              suppressHydrationWarning
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/80 bg-black/10 text-foreground/62 transition hover:border-accent/35 hover:text-foreground lg:inline-flex"
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
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:gap-3 lg:px-3.5",
                    sidebarCollapsed && "lg:justify-center lg:px-0",
                    active
                      ? "bg-accent text-white shadow-sm shadow-accent/20"
                      : "text-foreground/66 hover:bg-white/[0.06] hover:text-foreground"
                  )}
                >
                  <Icon size={17} />
                  <span className={cn(sidebarCollapsed && "lg:sr-only")}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="relative min-w-0">
          <div className="mb-4 flex justify-end">
            <div className="relative">
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setNotificationsOpen((value) => !value)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line/80 bg-panel/95 transition hover:bg-white/[0.06]"
              >
                <Bell size={18} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className="absolute right-0 top-12 z-50 w-[calc(100vw-1.5rem)] max-w-[360px] rounded-lg border border-line/90 bg-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        suppressHydrationWarning
                        onClick={toggleSound}
                        className="rounded-md border border-line/80 px-2.5 py-1 text-[11px] text-foreground/60 transition hover:text-foreground"
                      >
                        {soundEnabled ? "Sound on" : "Sound off"}
                      </button>
                      <button
                        type="button"
                        suppressHydrationWarning
                        onClick={playNotificationSound}
                        className="rounded-md border border-line/80 px-2.5 py-1 text-[11px] text-foreground/60 transition hover:text-foreground"
                      >
                        Test
                      </button>
                      <span className="text-xs text-foreground/45">{notifications.length} total</span>
                    </div>
                  </div>
                  <div className="max-h-[420px] space-y-3 overflow-y-auto">
                    {notifications.length === 0 ? <p className="text-sm text-foreground/55">No notifications yet.</p> : null}
                    {notifications.map((item) => (
                      <div key={item.id} className="rounded-lg border border-line/80 bg-black/10 p-3">
                        <p className="text-sm font-medium">{formatNotificationTitle(item.type)}</p>
                        <p className="mt-1 text-xs text-foreground/55">{formatNotificationMessage(item.payload)}</p>
                        <p className="mt-2 text-[11px] text-foreground/40">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function formatNotificationTitle(type: string) {
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
  };

  if (value.customerName && value.orderNumber && typeof value.minutesUntilSchedule === "number") {
    return `${value.customerName} (${value.orderNumber}) is scheduled in ${value.minutesUntilSchedule} minute${value.minutesUntilSchedule === 1 ? "" : "s"}.`;
  }

  return JSON.stringify(payload);
}

function playNotificationSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  try {
    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.28);

    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    return;
  }
}
