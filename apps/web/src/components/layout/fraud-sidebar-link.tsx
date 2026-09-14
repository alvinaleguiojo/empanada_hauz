"use client";

import { useEffect } from "react";

const FRAUD_LINK_MARKER = "data-fraud-sidebar-link";

function applyCollapsedState(link: HTMLAnchorElement) {
  const collapsed = window.localStorage.getItem("empanada-sidebar-collapsed") === "true";
  link.classList.toggle("lg:justify-center", collapsed);
  link.classList.toggle("lg:px-0", collapsed);
  link.classList.toggle("lg:gap-3", !collapsed);
  link.classList.toggle("lg:px-3.5", !collapsed);

  const label = Array.from(link.querySelectorAll<HTMLElement>("span")).find((element) => element.textContent?.trim() === "Fraud Center");
  if (label) {
    label.classList.toggle("lg:sr-only", collapsed);
  }
}

export function FraudSidebarLink() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let stateInterval: number | null = null;

    const install = () => {
      if (cancelled) return;

      const existing = document.querySelector<HTMLAnchorElement>(`[${FRAUD_LINK_MARKER}]`);
      if (existing) {
        applyCollapsedState(existing);
        return;
      }

      const deliveryLink = document.querySelector<HTMLAnchorElement>('a[href="/delivery-network"]');
      if (!deliveryLink || !deliveryLink.parentElement) return;

      const fraudLink = deliveryLink.cloneNode(true) as HTMLAnchorElement;
      fraudLink.href = "/fraud";
      fraudLink.removeAttribute("aria-current");
      fraudLink.setAttribute(FRAUD_LINK_MARKER, "true");
      fraudLink.setAttribute("aria-label", "Fraud Center");
      fraudLink.setAttribute("title", "Fraud Center");

      const label = Array.from(fraudLink.querySelectorAll<HTMLElement>("span")).find((element) => element.textContent?.trim() === "Delivery");
      const labelClassName = label?.className ?? "";
      if (label) label.textContent = "Fraud Center";

      const icon = fraudLink.querySelector("svg");
      if (icon) {
        icon.outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9.5 12 1.7 1.7 3.5-3.5"/></svg>';
      } else {
        const iconWrapper = document.createElement("span");
        iconWrapper.className = "inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center";
        iconWrapper.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9.5 12 1.7 1.7 3.5-3.5"/></svg>';
        fraudLink.insertBefore(iconWrapper, fraudLink.firstChild);
      }

      if (!label) {
        const nextLabel = document.createElement("span");
        nextLabel.className = labelClassName;
        nextLabel.textContent = "Fraud Center";
        fraudLink.appendChild(nextLabel);
      }

      deliveryLink.insertAdjacentElement("afterend", fraudLink);
      applyCollapsedState(fraudLink);
    };

    install();
    observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    stateInterval = window.setInterval(install, 250);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (stateInterval) window.clearInterval(stateInterval);
      document.querySelector(`[${FRAUD_LINK_MARKER}]`)?.remove();
    };
  }, []);

  return null;
}
