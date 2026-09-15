"use client";

import { useEffect } from "react";

export function OrderFraudTrigger({
  visible,
  onClick
}: {
  visible: boolean;
  onClick: () => void;
}) {
  useEffect(() => {
    if (!visible) return;

    const inject = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const editButton = buttons.find((button) => button.textContent?.replace(/\s+/g, " ").trim() === "Edit Details");
      if (!editButton) return;
      if (editButton.parentElement?.querySelector("[data-order-fraud-trigger]") || document.querySelector("[data-order-fraud-trigger]")) return;

      const fraudButton = document.createElement("button");
      fraudButton.type = "button";
      fraudButton.setAttribute("data-order-fraud-trigger", "true");
      fraudButton.setAttribute("aria-label", "Open fraud drawer");
      fraudButton.className = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-3 text-red-500 hover:text-red-600";
      fraudButton.textContent = "Fraud";
      fraudButton.addEventListener("click", onClick);
      editButton.parentElement?.insertBefore(fraudButton, editButton);
    };

    inject();
    const observer = new MutationObserver(inject);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector("[data-order-fraud-trigger]")?.remove();
    };
  }, [visible, onClick]);

  return null;
}
