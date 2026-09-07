"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Role = "admin" | "operations" | "kitchen" | "dispatcher" | "rider";
type User = { id: string; email: string; name: string; role: Role; createdAt: string };

const roles: Role[] = ["admin", "operations", "kitchen", "dispatcher", "rider"];
const roleLabel = (role: Role) => role.charAt(0).toUpperCase() + role.slice(1);

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operations" as Role });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try { setUsers(await apiFetch<User[]>("/admin/users")); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load users."); }
    finally { setLoading(false); }
  }

  function reset() { setEditingId(null); setForm({ name: "", email: "", password: "", role: "operations" }); }

  function edit(user: User) {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setMessage(null);
    try {
      const payload: Record<string, string> = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      if (form.password) payload.password = form.password;
      if (!payload.name || !payload.email) throw new Error("Name and email are required.");
      if (!editingId && !form.password) throw new Error("A password is required for a new user.");
      if (editingId) {
        await apiFetch(`/admin/users/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setMessage("User updated.");
      } else {
        await apiFetch("/admin/users", { method: "POST", body: JSON.stringify({ ...payload, password: form.password }) });
        setMessage("User created.");
      }
      reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save user."); }
    finally { setSaving(false); }
  }

  async function remove(user: User) {
    if (!window.confirm(`Remove ${user.name}'s access?`)) return;
    setError(null);
    try { await apiFetch(`/admin/users/${user.id}`, { method: "DELETE" }); setMessage("User removed."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to remove user."); }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-sm text-foreground/45"><Link href="/settings" className="hover:text-foreground">Settings</Link> / Users</div>
          <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-2 text-sm text-foreground/60">Manage staff accounts and assign their operational role.</p>
        </div>
        <Link href="/settings/roles"><Button variant="secondary"><Users className="h-4 w-4" /> View roles & permissions</Button></Link>
      </div>

      {error ? <div className="mb-5 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {message ? <div className="mb-5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm">{message}</div> : null}

      <Card className="mb-7 p-5 lg:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{editingId ? "Edit user" : "Add user"}</h2><p className="mt-1 text-sm text-foreground/50">Roles control what this account can access.</p></div>{editingId ? <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button> : null}</div>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2 text-sm font-medium"><span>Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Staff name" /></label>
          <label className="space-y-2 text-sm font-medium"><span>Email</span><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@example.com" /></label>
          <label className="space-y-2 text-sm font-medium"><span>{editingId ? "New password (optional)" : "Password"}</span><Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimum 8 characters" /></label>
          <label className="space-y-2 text-sm font-medium"><span>Role</span><select className="h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-sm text-foreground" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <div className="md:col-span-2 lg:col-span-4 flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? <><Pencil className="h-4 w-4" /> Save user</> : <><Plus className="h-4 w-4" /> Create user</>}</Button></div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.07] px-5 py-4"><h2 className="font-semibold">Staff accounts</h2></div>
        {loading ? <div className="p-6 text-sm text-foreground/50">Loading users…</div> : users.length === 0 ? <div className="p-8 text-center text-sm text-foreground/50">No staff users found.</div> : <div className="divide-y divide-white/[0.06]">{users.map((user) => <div key={user.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><div className="font-medium">{user.name}</div><div className="text-sm text-foreground/50">{user.email}</div></div><div className="flex items-center gap-3"><Badge>{roleLabel(user.role)}</Badge><Button variant="ghost" size="sm" onClick={() => edit(user)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="danger" size="sm" onClick={() => void remove(user)}><Trash2 className="h-4 w-4" /> Remove</Button></div></div>)}</div>}
      </Card>
    </main>
  );
}
