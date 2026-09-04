"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleUserRound, DollarSign, Home, Package } from "lucide-react";

const items = [
  { href: "/rider", label: "Home", icon: Home },
  { href: "/rider/deliveries", label: "Deliveries", icon: Package },
  { href: "/rider/earnings", label: "Earnings", icon: DollarSign },
  { href: "/rider/notifications", label: "Alerts", icon: Bell },
  { href: "/rider/profile", label: "Profile", icon: CircleUserRound }
] as const;

export function RiderBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-lg border-t border-[#EDE2D7] bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(59,29,15,0.08)] backdrop-blur">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/rider" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-black transition ${active ? "text-[#111827]" : "text-[#9A9088]"}`}
          >
            <Icon size={20} strokeWidth={active ? 2.7 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
