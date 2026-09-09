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
      syncProductCards();
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
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
    };
  }, [menuLoaded]);

  return <CustomerKioskPage key={menuLoaded ? "live-menu" : "fallback-menu"} />;
}

export default CustomerKioskGuard;
