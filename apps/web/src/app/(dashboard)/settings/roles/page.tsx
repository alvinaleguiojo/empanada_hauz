"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Role = { role: string; permissions: { code: string; label: string }[] };
type Permission = { code: string; label: string };

const labels: Record<string, string> = { admin: "Admin", operations: "Operations", kitchen: "Kitchen", dispatcher: "Dispatcher", rider: "Rider" };

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<Role[]>("/admin/roles"), apiFetch<Permission[]>("/admin/permissions")])
      .then(([nextRoles, nextPermissions]) => { setRoles(nextRoles); setPermissions(nextPermissions); })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load permissions."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-sm text-foreground/45"><Link href="/settings" className="hover:text-foreground">Settings</Link> / Roles & Permissions</div>
          <h1 className="text-3xl font-semibold tracking-tight">Roles & Permissions</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">This is the permission foundation used by Empanada Hauz Admin. Assign a role to a user and the role determines the capabilities available to that account.</p>
        </div>
        <Link href="/settings/users"><Button variant="secondary">Manage users</Button></Link>
      </div>

      {error ? <div className="mb-5 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {loading ? <Card className="p-8 text-sm text-foreground/50">Loading role permissions…</Card> : <>
        <div className="mb-5 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent" /><span className="text-sm text-foreground/60">{roles.length} roles · {permissions.length} defined permissions</span></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((item) => {
            const granted = new Set(item.permissions.map((permission) => permission.code));
            return <Card key={item.role} className="p-5 lg:p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">{labels[item.role] ?? item.role}</h2><p className="mt-1 text-xs uppercase tracking-[0.16em] text-foreground/40">{item.role}</p></div><Badge>{item.permissions.length} permissions</Badge></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{permissions.map((permission) => <div key={permission.code} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${granted.has(permission.code) ? "border-accent/20 bg-accent/[0.05]" : "border-white/[0.06] opacity-35"}`}>{granted.has(permission.code) ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : <span className="h-4 w-4 shrink-0" />}<span><span className="block font-medium">{permission.label}</span><span className="text-xs text-foreground/40">{permission.code}</span></span></div>)}</div></Card>;
          })}
        </div>
      </>}
    </main>
  );
}
