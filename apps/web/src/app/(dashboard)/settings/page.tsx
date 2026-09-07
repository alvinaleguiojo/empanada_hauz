"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bot, KeyRound, Package, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { decodeRole, hasPermission, type UserRole } from "@/lib/permissions";

type SettingsSection = { href: Route; title: string; description: string; icon: typeof Users; permission: string };
const sections: SettingsSection[] = [
  { href: "/settings/users", title: "Users", description: "Create staff accounts, change roles, reset passwords, and remove access.", icon: Users, permission: "users.manage" },
  { href: "/settings/roles", title: "Roles & Permissions", description: "Review the permissions granted to Admin, Operations, Kitchen, Dispatcher, and Rider roles.", icon: ShieldCheck, permission: "roles.manage" },
  { href: "/settings/products", title: "Products", description: "Add, edit, delete, price, and enable or disable products across the app.", icon: Package, permission: "products.manage" },
  { href: "/settings/ai-instructions", title: "AI Instructions", description: "Configure runtime instructions and customer-facing AI behavior.", icon: Bot, permission: "ai-instructions.manage" },
  { href: "/settings/ai-actions", title: "AI Actions", description: "Enable or disable AI capabilities and tune the semantic descriptions used to select them.", icon: SlidersHorizontal, permission: "ai-actions.manage" }
];

export default function SettingsPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  useEffect(() => { setRole(decodeRole(window.localStorage.getItem("empanada-token"))); }, []);
  const visibleSections = useMemo(() => sections.filter((section) => hasPermission(role, section.permission)), [role]);
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin Settings</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">Manage access to Empanada Hauz Admin and configure system behavior from one place.</p></div>
      {role && visibleSections.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleSections.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="group"><Card className="h-full p-6 transition-colors group-hover:border-accent/30 group-hover:bg-accent/[0.03]"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]"><Icon className="h-5 w-5 text-accent" /></div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-foreground/55">{description}</p><p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent">Open settings <span aria-hidden="true">→</span></p></Card></Link>)}</div> : role ? <Card className="p-8 text-center"><p className="font-semibold">No settings permissions</p><p className="mt-1 text-sm text-foreground/50">Your current role does not have access to any settings management area.</p></Card> : <Card className="p-8 text-sm text-foreground/50">Loading access permissions…</Card>}
      <Card className="mt-6 p-5"><div className="flex items-start gap-4"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-foreground/55" /><div><h2 className="font-semibold">Role-based access control</h2><p className="mt-1 text-sm leading-6 text-foreground/55">Settings cards are filtered from the signed-in role, while the API independently enforces the same permission matrix. Product management is restricted to Admin; Operations can view the live catalog through authorized endpoints.</p></div></div></Card>
    </main>
  );
}
