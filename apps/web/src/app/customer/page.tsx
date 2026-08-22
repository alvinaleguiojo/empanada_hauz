"use client";

import { useEffect } from "react";
import CustomerKioskPage from "./page-client";

function CustomerPageTotalFix() {
  useEffect(() => {
    let syncing = false;

    const syncTotals = () => {
      if (syncing) return;

      const deliveryRow = Array.from(document.querySelectorAll("div")).find((element) =>
        element.textContent?.includes("Est. delivery fee")
      );
      if (!deliveryRow) return;

      const deliveryText = Array.from(deliveryRow.querySelectorAll("span"))
        .map((element) => element.textContent?.trim() ?? "")
        .find((text) => text.includes("Php"));
      const deliveryMatch = deliveryText?.match(/Php\s*([\d,.]+)/);
      const deliveryFee = deliveryMatch ? Number(deliveryMatch[1].replace(/,/g, "")) : 0;
      if (!Number.isFinite(deliveryFee) || deliveryFee <= 0) return;

      const totalRow = Array.from(document.querySelectorAll("div")).find(
        (element) => element.children.length === 2 && element.children[0]?.textContent?.trim() === "TOTAL"
      );
      const totalValue = totalRow?.children[1] as HTMLElement | undefined;
      if (!totalRow || !totalValue) return;

      const currentTotalMatch = totalValue.textContent?.match(/([\d,.]+)/);
      if (!currentTotalMatch) return;

      const currentTotal = Number(currentTotalMatch[1].replace(/,/g, ""));
      const subtotal = currentTotal - deliveryFee;
      const correctedTotal = subtotal + deliveryFee;
      const formattedTotal = `Php ${Number.isInteger(correctedTotal) ? correctedTotal : correctedTotal.toFixed(2)}`;

      syncing = true;
      if (totalValue.textContent?.trim() !== formattedTotal) {
        totalValue.textContent = formattedTotal;
      }

      const note = Array.from(totalRow.parentElement?.querySelectorAll("p") ?? []).find((element) =>
        element.textContent?.includes("Delivery fee is separate and confirmed by our team.")
      );
      if (note) {
        note.textContent = "Total includes the estimated delivery fee; final fee is confirmed by our team.";
      }

      const stickyBar = document.querySelector("div.fixed.inset-x-0.bottom-0");
      if (stickyBar) {
        const stickyValue = Array.from(stickyBar.querySelectorAll("div")).find((element) =>
          /^Php\s*[\d,.]+$/.test(element.textContent?.trim() ?? "")
        ) as HTMLElement | undefined;
        if (stickyValue && stickyValue.textContent?.trim() !== formattedTotal) {
          stickyValue.textContent = formattedTotal;
        }
      }

      syncing = false;
    };

    syncTotals();
    const observer = new MutationObserver(syncTotals);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => observer.disconnect();
  }, []);

  return <CustomerKioskPage />;
}

export default CustomerPageTotalFix;
