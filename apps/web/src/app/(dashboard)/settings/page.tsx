"use client";

import Link from "next/link";
import { Bot, KeyRound, ShieldCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

const sections = [
  { href: "/settings/users", title: "Users", description: "Create staff accounts, change roles, reset passwords, and remove access.", icon: Users },
  { href: "/settings/roles", title: "Roles & Permissions", description: "Review the permissions granted to Admin, Operations, Kitchen, Dispatcher, and Rider roles.", icon: ShieldCheck },
  { href: "/settings/ai-instructions", title: "AI Instructions", description: "Configure runtime instructions and customer-facing AI behavior.", icon: Bot }
];

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Admin Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">Manage access to Empanada Hauz Admin and configure system behavior from one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full p-6 transition-colors group-hover:border-accent/30 group-hover:bg-accent/[0.03]">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                <Icon className="h-5 w-5 text-accent" />
              </div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-foreground/55">{description}</p>
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent">Open settings <span aria-hidden="true">→</span></p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <div className="flex items-start gap-4">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-foreground/55" />
          <div>
            <h2 className="font-semibold">Access control foundation</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/55">The current implementation uses the existing staff role on each user and a central permission matrix. The API enforces admin-only user management; page-level permission enforcement can be expanded next without redesigning this Settings area.</p>
          </div>
        </div>
      </Card>
    </main>
  );
}
