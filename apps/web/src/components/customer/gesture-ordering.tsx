"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Hand, Minus, Plus, ShoppingBag, Sparkles, X } from "lucide-react";
import { MENU_ITEMS } from "@/lib/menu";

const MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm";

type Point = { x: number; y: number };

export default function GestureOrdering() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState("Point at a flavor");
  const [step, setStep] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [selected, setSelected] = useState<Record<string, number>>({});

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const recognizer = useRef<any>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const inferAt = useRef(0);
  const target = useRef<Point | null>(null);
  const cursor = useRef<Point | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const pinch = useRef(false);
  const pinchStart = useRef<Point | null>(null);
  const pinchMoved = useRef(false);
  const pinchAt = useRef(0);
  const swipeAt = useRef(0);
  const hovered = useRef<HTMLElement | null>(null);

  const activeItems = useMemo(
    () => MENU_ITEMS.filter((item) => item.available !== false),
    []
  );

  const syncCart = () => {
    const form = document.getElementById("kiosk-order-form");
    if (!form) return;
    const next: Record<string, number> = {};
    let count = 0;
    let total = 0;

    form.querySelectorAll<HTMLInputElement>('input[aria-label$=" quantity"]').forEach((input) => {
      const name = input.getAttribute("aria-label")?.replace(/ quantity$/, "") ?? "";
      const quantity = Math.max(0, Number(input.value || 0));
      if (!name || quantity < 1) return;
      const item = MENU_ITEMS.find((entry) => entry.label === name || entry.value === name);
      if (!item) return;
      next[item.value] = quantity;
      count += quantity;
      total += quantity * item.price;
    });

    setSelected(next);
    setCartCount(count);
    setCartTotal(total);
  };

  const clickFlavor = (value: string) => {
    const form = document.getElementById("kiosk-order-form");
    if (!form) return;
    const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>("article button"));
    const button = buttons.find((item) => item.textContent?.includes(value));
    button?.click();
    window.setTimeout(syncCart, 40);
  };

  const changeQuantity = (value: string, delta: number) => {
    const form = document.getElementById("kiosk-order-form");
    if (!form) return;
    const input = Array.from(form.querySelectorAll<HTMLInputElement>("input")).find((item) =>
      item.getAttribute("aria-label")?.replace(/ quantity$/, "") === value
    );
    if (!input) return;

    const buttons = Array.from(input.closest("div")?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const button = delta > 0
      ? buttons.find((item) => item.getAttribute("aria-label")?.startsWith("Increase"))
      : buttons.find((item) => item.getAttribute("aria-label")?.startsWith("Decrease"));
    button?.click();
    window.setTimeout(syncCart, 40);
  };

  const navigate = (direction: "next" | "prev") => {
    const selector = direction === "next" ? "[data-gesture-next]" : "[data-gesture-prev]";
    const button = document.querySelector<HTMLElement>(selector);
    if (!button || button.getAttribute("disabled") !== null) return;
    button.click();
    window.setTimeout(() => {
      const text = document.querySelector("#kiosk-order-form h2")?.textContent?.toLowerCase() ?? "";
      setStep(text.includes("almost") || text.includes("review") ? 2 : text.includes("how should") ? 1 : 0);
      syncCart();
    }, 50);
  };

  useEffect(() => {
    if (!on) return;
    const form = document.getElementById("kiosk-order-form");
    form?.classList.add("eh-gesture-order-form");
    document.documentElement.classList.add("eh-gesture-active");

    const interval = window.setInterval(syncCart, 250);
    syncCart();

    let dead = false;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks(WASM);
        const r = await vision.GestureRecognizer.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        });

        if (dead) {
          r.close();
          return;
        }

        recognizer.current = r;
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });

        if (dead) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }

        stream.current = s;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        await el.play();

        const draw = (points: any[]) => {
          const c = canvas.current;
          if (!c) return;
          const width = c.clientWidth;
          const height = c.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          c.width = width * dpr;
          c.height = height * dpr;
          const ctx = c.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);

          const lines = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
          ctx.strokeStyle = "rgba(246,239,221,.72)";
          ctx.lineWidth = 1.5;
          lines.forEach(([a,b]) => {
            const p = points[a], q = points[b];
            if (!p || !q) return;
            ctx.beginPath();
            ctx.moveTo((1 - p.x) * width, p.y * height);
            ctx.lineTo((1 - q.x) * width, q.y * height);
            ctx.stroke();
          });
          points.forEach((p) => {
            ctx.beginPath();
            ctx.arc((1 - p.x) * width, p.y * height, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(227,166,75,.9)";
            ctx.fill();
          });
        };

        const loop = (time: number) => {
          if (dead) return;
          raf.current = requestAnimationFrame(loop);

          const t = performance.now();
          if (el.videoWidth && t - inferAt.current >= 33) {
            inferAt.current = t;
            const result = r.recognizeForVideo(el, t);
            const hand = result.landmarks?.[0];
            draw(hand ?? []);

            if (!hand) {
              target.current = null;
              setMsg("Show your hand to start");
              if (hovered.current) {
                hovered.current.style.outline = "";
                hovered.current = null;
              }
              return;
            }

            const index = hand[8];
            target.current = {
              x: (1 - index.x) * window.innerWidth,
              y: index.y * window.innerHeight
            };

            const sx = target.current.x;
            const sy = target.current.y;
            const previous = lastPoint.current;
            const dx = previous ? sx - previous.x : 0;
            const dy = previous ? sy - previous.y : 0;
            lastPoint.current = { x: sx, y: sy };

            const isPinching = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) < 0.055;
            const now = Date.now();

            if (isPinching && !pinch.current) {
              pinch.current = true;
              pinchStart.current = { x: sx, y: sy };
              pinchMoved.current = false;
              pinchAt.current = now;
            }

            if (isPinching && pinch.current && pinchStart.current) {
              const moveX = sx - pinchStart.current.x;
              const moveY = sy - pinchStart.current.y;
              if (Math.hypot(moveX, moveY) > 18) pinchMoved.current = true;

              if (pinchMoved.current && Math.abs(moveY) > Math.abs(moveX) * 0.8) {
                const formElement = document.getElementById("kiosk-order-form");
                formElement?.scrollBy({ top: -dy * 1.7, behavior: "auto" });
                setMsg("Dragging · release to stop");
              } else {
                setMsg("Pinch held · release to select");
              }
            }

            if (!isPinching && pinch.current) {
              const wasMoved = pinchMoved.current;
              pinch.current = false;
              pinchStart.current = null;
              pinchMoved.current = false;

              if (!wasMoved && now - pinchAt.current > 90) {
                const hit = document.elementFromPoint(sx, sy) as HTMLElement | null;
                const interactive = hit?.closest<HTMLElement>("button,a,input,textarea,select,label") ?? null;
                interactive?.click();
                if (interactive) {
                  interactive.animate(
                    [{ transform: "scale(1)" }, { transform: "scale(.94)" }, { transform: "scale(1)" }],
                    { duration: 180, easing: "ease-out" }
                  );
                  setMsg("Selected");
                  window.setTimeout(syncCart, 50);
                }
              }
            }

            if (!isPinching && previous && Math.abs(dx) > 120 && Math.abs(dx) > Math.abs(dy) * 1.35 && now - swipeAt.current > 1000) {
              swipeAt.current = now;
              navigate(dx < 0 ? "next" : "prev");
              setMsg(dx < 0 ? "Next step" : "Previous step");
            }

            const hit = document.elementFromPoint(sx, sy) as HTMLElement | null;
            const interactive = hit?.closest<HTMLElement>("button,a,input,textarea,select,label");
            if (interactive !== hovered.current) {
              if (hovered.current) hovered.current.style.outline = "";
              hovered.current = interactive;
              if (interactive) {
                interactive.style.outline = "2px solid rgba(227,166,75,.95)";
                interactive.style.outlineOffset = "3px";
              }
            }
          }

          const wanted = target.current;
          if (wanted) {
            const current = cursor.current ?? wanted;
            const next = {
              x: current.x + (wanted.x - current.x) * 0.28,
              y: current.y + (wanted.y - current.y) * 0.28
            };
            cursor.current = next;
            const cursorElement = document.getElementById("eh-gesture-cursor");
            if (cursorElement) {
              cursorElement.style.transform = `translate3d(${next.x}px,${next.y}px,0)`;
              cursorElement.style.opacity = "1";
            }
          }

          const pulse = document.getElementById("eh-gesture-pulse");
          if (pulse) {
            pulse.style.transform = `scale(${1 + Math.sin(performance.now() / 480) * 0.08})`;
          }
        };

        raf.current = requestAnimationFrame(loop);
      } catch (error) {
        setMsg(error instanceof Error ? error.message : "Camera setup failed");
      }
    })();

    return () => {
      dead = true;
      window.clearInterval(interval);
      if (raf.current) cancelAnimationFrame(raf.current);
      recognizer.current?.close();
      stream.current?.getTracks().forEach((track) => track.stop());
      recognizer.current = null;
      stream.current = null;
      form?.classList.remove("eh-gesture-order-form");
      document.documentElement.classList.remove("eh-gesture-active");
      if (hovered.current) {
        hovered.current.style.outline = "";
        hovered.current = null;
      }
    };
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    const updateStepClass = () => {
      root.classList.remove("eh-gesture-step-0", "eh-gesture-step-1", "eh-gesture-step-2");
      root.classList.add(`eh-gesture-step-${step}`);
    };
    updateStepClass();
    return () => root.classList.remove("eh-gesture-step-0", "eh-gesture-step-1", "eh-gesture-step-2");
  }, [on, step]);

  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => {
      const title = document.querySelector("#kiosk-order-form h2")?.textContent?.toLowerCase() ?? "";
      setStep(title.includes("almost") ? 2 : title.includes("how should") ? 1 : 0);
      syncCart();
    }, 350);
    return () => window.clearInterval(timer);
  }, [on]);

  const close = () => setOn(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOn(true)}
        className="fixed bottom-5 left-5 z-[70] inline-flex items-center gap-2 rounded-full border border-[#E3A64B]/40 bg-[#17110b]/95 px-4 py-3 text-sm font-extrabold text-[#F6EFDD] shadow-2xl backdrop-blur"
      >
        <Hand size={17} className="text-[#E3A64B]" />
        Gesture Order
      </button>

      {on ? (
        <div className="fixed inset-0 z-[60] bg-[#090705]">
          <div className="absolute inset-0 overflow-hidden">
            <video ref={video} muted playsInline className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-75" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(9,7,5,.22)_42%,rgba(9,7,5,.82)_100%)]" />
            <canvas ref={canvas} className="absolute inset-0 h-full w-full" />

            <header className="absolute inset-x-0 top-0 z-[80] flex items-center justify-between px-4 py-4 sm:px-7 sm:py-6">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-black/35 backdrop-blur-xl">
                  <Sparkles size={19} className="text-[#E3A64B]" />
                </div>
                <div>
                  <div className="font-[family-name:var(--font-display)] text-lg font-extrabold text-white">Empanada Hauz</div>
                  <div className="text-[10px] font-bold uppercase tracking-[.2em] text-white/45">Gesture ordering</div>
                </div>
              </div>
              <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-xl">
                <X size={19} />
              </button>
            </header>

            <div className="absolute left-1/2 top-20 z-[70] -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-4 py-2 text-[11px] font-semibold text-white/70 backdrop-blur-xl sm:top-24">
              {msg}
            </div>

            {step === 0 ? (
              <section className="absolute inset-x-0 top-32 bottom-28 z-[70] flex flex-col px-4 sm:top-36 sm:px-8">
                <div className="mx-auto w-full max-w-6xl">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <div className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-white sm:text-5xl">Pick your flavors</div>
                      <div className="mt-1 text-sm text-white/55">Point at a card · pinch and release to add</div>
                    </div>
                    <div className="hidden rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-right backdrop-blur-xl sm:block">
                      <div className="text-[9px] font-bold uppercase tracking-[.18em] text-white/40">Minimum</div>
                      <div className="font-[family-name:var(--font-mono)] text-sm font-bold text-white">10 pcs</div>
                    </div>
                  </div>

                  <div className="eh-gesture-menu grid max-h-[calc(100vh-310px)] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {activeItems.map((item) => {
                      const quantity = selected[item.value] ?? 0;
                      return (
                        <div
                          key={item.value}
                          className={`group relative overflow-hidden rounded-[22px] border backdrop-blur-xl transition ${quantity ? "border-[#E3A64B]/80 bg-[#21170d]/85" : "border-white/12 bg-[#17110b]/65"}`}
                        >
                          <button type="button" onClick={() => clickFlavor(item.value)} className="block min-h-[145px] w-full text-left">
                            <div className="absolute inset-0">
                              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover opacity-55 transition duration-300 group-hover:scale-105" /> : null}
                              <div className="absolute inset-0 bg-gradient-to-t from-[#110c08] via-[#110c08]/45 to-transparent" />
                            </div>
                            <div className="relative flex min-h-[145px] flex-col justify-end p-4">
                              <div className="flex items-end justify-between gap-3">
                                <div>
                                  <div className="font-[family-name:var(--font-display)] text-xl font-extrabold text-white">{item.value}</div>
                                  <div className="mt-1 font-[family-name:var(--font-mono)] text-sm font-bold text-[#E3A64B]">₱{item.price}</div>
                                </div>
                                {quantity > 0 ? (
                                  <span className="grid h-9 min-w-9 place-items-center rounded-full bg-[#E3A64B] px-2 font-[family-name:var(--font-mono)] text-xs font-extrabold text-[#20160d]">
                                    {quantity}
                                  </span>
                                ) : (
                                  <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/25 text-white/70"><Plus size={17} /></span>
                                )}
                              </div>
                            </div>
                          </button>
                          {quantity > 0 ? (
                            <div className="absolute right-3 top-3 flex items-center overflow-hidden rounded-full border border-white/15 bg-black/60 backdrop-blur-xl">
                              <button type="button" aria-label={`Decrease ${item.value}`} onClick={() => changeQuantity(item.value, -1)} className="grid h-9 w-9 place-items-center text-white/75"><Minus size={14} /></button>
                              <span className="w-7 text-center font-[family-name:var(--font-mono)] text-xs font-bold text-white">{quantity}</span>
                              <button type="button" aria-label={`Increase ${item.value}`} onClick={() => changeQuantity(item.value, 1)} className="grid h-9 w-9 place-items-center text-[#E3A64B]"><Plus size={14} /></button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : (
              <section className="pointer-events-none absolute inset-x-0 top-28 bottom-24 z-[65] flex items-center justify-center px-3 sm:px-8">
                <div className="w-full max-w-3xl rounded-[30px] border border-white/10 bg-black/15 p-2 shadow-2xl backdrop-blur-sm">
                  <div className="h-[min(68vh,620px)] rounded-[24px] border border-white/8 bg-black/10" />
                </div>
              </section>
            )}

            <div id="eh-gesture-cursor" className="pointer-events-none absolute left-0 top-0 z-[95] h-8 w-8 -ml-4 -mt-4 rounded-full border-2 border-[#F6EFDD] bg-[#E3A64B]/35 shadow-[0_0_0_7px_rgba(227,166,75,.18),0_0_24px_rgba(227,166,75,.65)] opacity-0">
              <div id="eh-gesture-pulse" className="absolute inset-[-5px] rounded-full border border-[#E3A64B]/45" />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>

            <footer className="absolute inset-x-0 bottom-0 z-[80] flex items-center justify-between gap-3 border-t border-white/10 bg-black/45 px-4 py-3 backdrop-blur-2xl sm:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5">
                  <ShoppingBag size={18} className="text-[#E3A64B]" />
                </div>
                <div className="min-w-0">
                  <div className="font-[family-name:var(--font-mono)] text-sm font-bold text-white">{cartCount} pcs · ₱{cartTotal}</div>
                  <div className="text-[10px] text-white/45">Your order updates live</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => navigate("prev")} className="grid h-12 w-12 place-items-center rounded-2xl border border-white/12 bg-white/5 text-white/70 backdrop-blur-xl">
                  <ChevronLeft size={19} />
                </button>
                <button type="button" onClick={() => navigate("next")} disabled={step === 0 && cartCount < 10} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#E3A64B] px-5 font-extrabold text-[#20160d] shadow-lg disabled:cursor-not-allowed disabled:opacity-35">
                  {step === 2 ? "Place order" : "Continue"} <ChevronRight size={18} />
                </button>
              </div>
            </footer>

            <div className="pointer-events-none absolute bottom-20 left-1/2 z-[82] -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-center text-[10px] font-semibold text-white/55 backdrop-blur-xl">
              ☝ Move · 🤏 Pinch = select · 🤏 Drag = scroll · ← → Swipe
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        html.eh-gesture-active { overflow: hidden; }

        form.eh-gesture-order-form {
          position: fixed !important;
          left: 50% !important;
          top: 112px !important;
          bottom: 92px !important;
          width: min(760px, calc(100vw - 24px)) !important;
          max-width: 760px !important;
          height: auto !important;
          margin: 0 !important;
          transform: translateX(-50%) !important;
          overflow: auto !important;
          overscroll-behavior: contain !important;
          scrollbar-width: thin;
          scrollbar-color: rgba(227,166,75,.45) transparent;
          border: 1px solid rgba(255,255,255,.12) !important;
          border-radius: 30px !important;
          background: rgba(23,17,11,.68) !important;
          backdrop-filter: blur(20px) saturate(1.1) !important;
          box-shadow: 0 30px 100px rgba(0,0,0,.45) !important;
          padding: 8px !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          z-index: 72 !important;
        }

        html.eh-gesture-active.eh-gesture-step-0 #kiosk-order-form {
          visibility: hidden !important;
          pointer-events: none !important;
        }

        html.eh-gesture-active.eh-gesture-step-1 #kiosk-order-form,
        html.eh-gesture-active.eh-gesture-step-2 #kiosk-order-form {
          visibility: visible !important;
        }

        html.eh-gesture-active #kiosk-order-form > section {
          background: rgba(23,17,11,.52) !important;
          border: 0 !important;
          box-shadow: none !important;
          border-radius: 22px !important;
          backdrop-filter: none !important;
        }

        html.eh-gesture-active #kiosk-order-form input,
        html.eh-gesture-active #kiosk-order-form textarea,
        html.eh-gesture-active #kiosk-order-form button {
          min-height: 52px;
        }

        .eh-gesture-menu { scrollbar-width: thin; scrollbar-color: rgba(227,166,75,.45) transparent; }
        .eh-gesture-menu::-webkit-scrollbar { width: 5px; }
        .eh-gesture-menu::-webkit-scrollbar-thumb { background: rgba(227,166,75,.45); border-radius: 999px; }

        @media (max-width: 640px) {
          form.eh-gesture-order-form {
            top: 94px !important;
            bottom: 82px !important;
            width: calc(100vw - 16px) !important;
            border-radius: 24px !important;
          }
          .eh-gesture-menu { grid-template-columns: 1fr; }
          .eh-gesture-menu > div { min-height: 132px; }
        }
      `}</style>
    </>
  );
}
