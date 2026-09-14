"use client";

import { useEffect, useState } from "react";
import CustomerKioskPage from "./page-client";

const BAG_HINT_KEY = "empanada-bag-hint-dismissed";

function CustomerKioskGuard() {
  const [enhancementsReady, setEnhancementsReady] = useState(false);

  useEffect(() => {
    setEnhancementsReady(true);
  }, []);

  useEffect(() => {
    if (!enhancementsReady) return;

    let lastBagQuantity: number | null = null;
    let hintElement: HTMLElement | null = null;
    let toastElement: HTMLElement | null = null;
    let toastTimer: number | null = null;
    let checkoutNavigation: HTMLElement | null = null;
    let navigationTimer: number | null = null;

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

    const syncCheckoutNavigation = () => {
      const stepButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Order steps"] button'));
      const bagButton = document.querySelector<HTMLButtonElement>('button[aria-label^="Open bag with"]');
      if (stepButtons.length === 0 || !bagButton) return;

      const activeIndex = stepButtons.findIndex((button) => button.className.includes("border-[#E3A64B]/70"));
      const step = activeIndex >= 0 ? activeIndex : 0;
      const quantity = readBagQuantity(bagButton);
      const policyCheckbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const policyAgreed = policyCheckbox?.checked ?? false;
      const isFirstStep = step === 0;
      const canContinue = !isFirstStep || quantity >= 10;
      const isFinalStep = step === stepButtons.length - 1;

      if (!checkoutNavigation) {
        checkoutNavigation = document.createElement("div");
        checkoutNavigation.className = "fixed inset-x-0 bottom-0 z-40 border-t border-[#F2E8D5]/10 bg-[#17110b]/95 px-3 py-3 shadow-[0_-18px_50px_-28px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:px-6 lg:px-8";
        document.body.appendChild(checkoutNavigation);
        document.body.style.paddingBottom = "88px";
      }

      const disabled = isFinalStep ? !policyAgreed : !canContinue;
      const primaryLabel = isFinalStep ? "Place order" : "Continue";
      const helperText = isFirstStep && quantity < 10
        ? `Add ${10 - quantity} more piece${10 - quantity === 1 ? "" : "s"} to continue`
        : isFinalStep && !policyAgreed
          ? "Please agree to the Privacy Policy to place your order"
          : "";

      const signature = `${step}|${quantity}|${policyAgreed}|${disabled}|${primaryLabel}|${helperText}`;
      if (checkoutNavigation.dataset.signature === signature) return;
      checkoutNavigation.dataset.signature = signature;

      checkoutNavigation.innerHTML = `
        <div class="mx-auto flex max-w-7xl items-center gap-2.5">
          <button type="button" data-kiosk-back class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#F2E8D5]/15 bg-[#241c13] text-[#F2E8D5] transition hover:border-[#E3A64B]/35 hover:bg-[#2b2117] ${step === 0 ? "cursor-not-allowed opacity-30" : ""}" ${step === 0 ? "disabled" : ""} aria-label="Go back">
            <span aria-hidden="true">←</span>
          </button>
          <div class="min-w-0 flex-1 text-center">
            ${helperText ? `<div class="mb-1 text-[11px] font-semibold text-[#C0472B]">${helperText}</div>` : ""}
            <div class="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F2E8D5]/40">Step ${step + 1} of ${stepButtons.length}</div>
          </div>
          <button type="button" data-kiosk-primary class="flex h-12 min-w-0 flex-1 max-w-sm items-center justify-center gap-2 rounded-xl bg-[#C0472B] px-4 text-sm font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_26px_-15px_rgba(192,71,43,0.95)] transition hover:bg-[#d05336] ${disabled ? "cursor-not-allowed opacity-35" : ""}" ${disabled ? "disabled" : ""}>
            ${primaryLabel} <span aria-hidden="true">${isFinalStep ? "✓" : "→"}</span>
          </button>
        </div>`;

      checkoutNavigation.querySelector<HTMLButtonElement>("[data-kiosk-back]")?.addEventListener("click", () => {
        if (step <= 0) return;
        stepButtons[step - 1]?.click();
      });

      checkoutNavigation.querySelector<HTMLButtonElement>("[data-kiosk-primary]")?.addEventListener("click", () => {
        if (disabled) return;
        bagButton.click();
        window.setTimeout(() => {
          const drawerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("aside button"));
          const action = drawerButtons.find((button) => button.textContent?.replace(/\s+/g, " ").trim().startsWith(primaryLabel));
          action?.click();
        }, 50);
      });
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
    syncCheckoutNavigation();
    navigationTimer = window.setInterval(syncCheckoutNavigation, 250);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      hideToast();
      dismissBagHint(false);
      if (navigationTimer != null) window.clearInterval(navigationTimer);
      checkoutNavigation?.remove();
      document.body.style.paddingBottom = "";
    };
  }, [enhancementsReady]);

  return <CustomerKioskPage />;
}

export default CustomerKioskGuard;
