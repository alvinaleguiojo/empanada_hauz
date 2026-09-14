"use client";

import { useEffect } from "react";

const FRAUD_LINK_MARKER = "data-fraud-sidebar-link";

export function FraudSidebarLink() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const install = () => {
      if (cancelled || document.querySelector(`[${FRAUD_LINK_MARKER}]`)) {
        return;
      }

      const deliveryLink = document.querySelector<HTMLAnchorElement>('a[href="/delivery-network"]');
      if (!deliveryLink || !deliveryLink.parentElement) {
        return;
      }

      const fraudLink = deliveryLink.cloneNode(true) as HTMLAnchorElement;
      fraudLink.href = "/fraud";
      fraudLink.removeAttribute("aria-current");
      fraudLink.setAttribute(FRAUD_LINK_MARKER, "true");
      fraudLink.setAttribute("aria-label", "Fraud Center");

      const label = Array.from(fraudLink.querySelectorAll<HTMLElement>("span")).find((element) => element.textContent?.trim() === "Delivery");
      if (label) {
        label.textContent = "Fraud Center";
      }

      const icon = fraudLink.querySelector("svg");
      if (icon) {
        icon.outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 7.8 7.5 9.5 4.3-1.7 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9.5 12 1.7 1.7 3.5-3.5"/></svg>';
      }

      deliveryLink.insertAdjacentElement("afterend", fraudLink);
    };

    install();
    observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.querySelector(`[${FRAUD_LINK_MARKER}]`)?.remove();
    };
  }, []);

  return null;
}
