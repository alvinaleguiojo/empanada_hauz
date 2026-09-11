"use client";

import { useEffect, useState } from "react";
import CustomerKioskPage from "./page-client";
import { apiFetch } from "@/lib/api";
import { replaceMenuItems } from "@/lib/menu";

type PublicProduct = {
  name: string;
  price: number;
  available: boolean;
  tags?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  sortOrder?: number;
};

const BAG_HINT_KEY = "empanada-bag-hint-dismissed";

function CustomerKioskGuard() {
  const [menuLoaded, setMenuLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void apiFetch<PublicProduct[]>("/products")
      .then((products) => {
        if (!active) return;
        replaceMenuItems(products);
        setMenuLoaded(true);
      })
      .catch(() => {
        if (active) setMenuLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!menuLoaded) return;

    let lastBagQuantity: number | null = null;
    let hintElement: HTMLElement | null = null;
    let toastElement: HTMLElement | null = null;
    let toastTimer: number | null = null;

    const readBagQuantity = (button: HTMLButtonElement) => {
      const match = button.textContent?.match(/(\d+)\s+pcs/i);
      return match ? Number(match[1]) : 0;
    };

    const dismissBagHint = (remember = true) => {
      if (remember) window.localStorage.setItem(BAG_HINT_KEY, "true");
      hintElement?.remove();
      hintElement = null;
    };

    const hideToast = () => {
      if (toastTimer != null) window.clearTimeout(toastTimer);
      toastTimer = null;
      toastElement?.remove();
      toastElement = null;
    };

    const showToast = (bagButton: HTMLButtonElement) => {
      hideToast();

      const toast = document.createElement("div");
      toast.className = "fixed bottom-5 right-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-[#E3A64B]/30 bg-[#241c13]/95 px-4 py-3 text-[#F2E8D5] shadow-[0_18px_45px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:right-6";
      toast.innerHTML = `<div><div class="text-sm font-bold">Added to your bag</div><div class="mt-0.5 text-xs text-[#F2E8D5]/55">Your order summary is in the bag.</div></div><button type="button" class="shrink-0 rounded-xl bg-[#E3A64B] px-3 py-2 text-xs font-extrabold uppercase tracking-[0.06em] text-[#20160d]">View bag</button>`;

      const viewButton = toast.querySelector<HTMLButtonElement>("button");
      viewButton?.addEventListener("click", () => {
        dismissBagHint(true);
        bagButton.click();
        hideToast();
      });

      document.body.appendChild(toast);
      toastElement = toast;
      toastTimer = window.setTimeout(hideToast, 4500);
    };

    const showBagHint = (bagButton: HTMLButtonElement) => {
      if (hintElement || window.localStorage.getItem(BAG_HINT_KEY) === "true") return;

      const header = document.querySelector<HTMLElement>("header");
      if (!header) return;
      header.style.position = "sticky";

      const hint = document.createElement("div");
      hint.className = "absolute right-3 top-[calc(100%+10px)] z-[55] w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-[#E3A64B]/35 bg-[#241c13] p-4 text-[#F2E8D5] shadow-[0_18px_45px_-20px_rgba(0,0,0,0.9)] sm:right-6";
      hint.innerHTML = `<div class="flex items-start gap-3"><div class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E3A64B]/15 text-[#E3A64B]"><span aria-hidden="true">🛍</span></div><div class="min-w-0 flex-1"><div class="text-sm font-bold">Your order summary is here</div><p class="mt-1 text-xs leading-5 text-[#F2E8D5]/55">Tap <strong class="text-[#F2E8D5]/80">Your bag</strong> anytime to review your items and total.</p><button type="button" class="mt-3 rounded-lg border border-[#F2E8D5]/10 bg-[#F2E8D5]/5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#F2E8D5]/70">Got it</button></div><button type="button" aria-label="Dismiss bag tip" class="shrink-0 text-[#F2E8D5]/35 transition hover:text-[#F2E8D5]">×</button></div>`;

      const buttons = hint.querySelectorAll<HTMLButtonElement>("button");
      buttons[0]?.addEventListener("click", () => dismissBagHint(true));
      buttons[1]?.addEventListener("click", () => dismissBagHint(true));

      header.appendChild(hint);
      hintElement = hint;

      bagButton.classList.add("ring-2", "ring-[#E3A64B]/70", "ring-offset-2", "ring-offset-[#17110b]");
      window.setTimeout(() => {
        bagButton.classList.remove("ring-2", "ring-[#E3A64B]/70", "ring-offset-2", "ring-offset-[#17110b]");
      }, 2200);
    };

    const syncHeaderLogo = () => {
      const header = document.querySelector<HTMLElement>("header");
      const logoWrap = header?.querySelector<HTMLElement>("svg")?.parentElement;
      const icon = logoWrap?.querySelector<SVGElement>("svg");
      if (!logoWrap) return;

      logoWrap.dataset.empanadaLogoReady = "true";
      logoWrap.style.width = "40px";
      logoWrap.style.height = "40px";
      logoWrap.style.minWidth = "40px";
      logoWrap.style.minHeight = "40px";
      logoWrap.style.flexShrink = "0";
      logoWrap.style.backgroundColor = "transparent";
      logoWrap.style.backgroundImage = 'url("/empanada%20hauz%20logo.jpg")';
      logoWrap.style.backgroundPosition = "center";
      logoWrap.style.backgroundRepeat = "no-repeat";
      logoWrap.style.backgroundSize = "contain";
      logoWrap.style.overflow = "hidden";

      if (icon) icon.style.display = "none";
    };

    const syncProductCards = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("article"));
      for (const card of cards) {
        const productButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
          const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return text.includes("Php ");
        });
        if (!productButton) continue;

        card.style.cursor = productButton.disabled ? "not-allowed" : "pointer";
        card.title = productButton.disabled ? "Sold out" : "Click to add or remove this flavor";
      }
    };

    const syncSoldOutButtons = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      for (const button of buttons) {
        const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (!text.includes("SOLD OUT")) continue;
        button.disabled = true;
        button.title = "Sold out";
        button.setAttribute("aria-disabled", "true");
        button.style.cursor = "not-allowed";
        button.style.opacity = "0.55";
      }
      syncHeaderLogo();
      syncProductCards();

      const bagButton = buttons.find((button) => button.getAttribute("aria-label")?.startsWith("Open bag with"));
      if (!bagButton) return;

      const bagQuantity = readBagQuantity(bagButton);
      if (lastBagQuantity == null) {
        lastBagQuantity = bagQuantity;
        return;
      }

      if (bagQuantity > lastBagQuantity) {
        showToast(bagButton);
        if (window.localStorage.getItem(BAG_HINT_KEY) !== "true") showBagHint(bagButton);
      }

      if (bagQuantity === 0) dismissBagHint(false);
      lastBagQuantity = bagQuantity;
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=\"true\"]")) return;

      const bagButton = target?.closest<HTMLButtonElement>("button[aria-label^=\"Open bag with\"]");
      if (bagButton) {
        dismissBagHint(true);
        return;
      }

      const button = target?.closest<HTMLButtonElement>("button");
      const card = target?.closest<HTMLElement>("article");

      if (button) {
        const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (text.includes("SOLD OUT")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (text === "Select all") {
          event.preventDefault();
          event.stopPropagation();
          const productButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((candidate) => {
            const candidateText = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
            return candidateText.includes("Php ") && !candidateText.includes("SOLD OUT") && !candidate.disabled;
          });
          for (const productButton of productButtons) productButton.click();
        }
        return;
      }

      if (!card) return;
      const productButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => {
        const text = candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return text.includes("Php ");
      });
      if (!productButton || productButton.disabled) return;

      event.preventDefault();
      productButton.click();
    };

    const observer = new MutationObserver(syncSoldOutButtons);
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener("click", handleClick, true);
    syncSoldOutButtons();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      hideToast();
      dismissBagHint(false);
    };
  }, [menuLoaded]);

  return <CustomerKioskPage key={menuLoaded ? "live-menu" : "fallback-menu"} />;
}

export default CustomerKioskGuard;
