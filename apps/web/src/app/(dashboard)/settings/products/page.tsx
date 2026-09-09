"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Product = { _id: string; name: string; description?: string | null; category: string; price: number; available: boolean; aliases: string[]; imageUrl?: string | null; sortOrder: number; tags: string[]; isFeatured: boolean; isNew: boolean; updatedAt: string };
type ProductForm = { name: string; description: string; category: string; price: string; available: boolean; aliases: string; imageUrl: string; sortOrder: string; tags: string; isFeatured: boolean; isNew: boolean };

const emptyForm: ProductForm = { name: "", description: "", category: "empanada", price: "", available: true, aliases: "", imageUrl: "", sortOrder: "100", tags: "", isFeatured: false, isNew: false };

export default function ProductsSettingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try { setProducts(await apiFetch<Product[]>("/admin/products")); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load products."); }
    finally { setLoading(false); }
  }

  function reset() { setEditingId(null); setForm(emptyForm); }

  function edit(product: Product) {
    setEditingId(product._id);
    setForm({ name: product.name, description: product.description ?? "", category: product.category, price: String(product.price), available: product.available, aliases: product.aliases.join(", "), imageUrl: product.imageUrl ?? "", sortOrder: String(product.sortOrder), tags: product.tags.join(", "), isFeatured: product.isFeatured, isNew: product.isNew });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setMessage(null);
    try {
      const price = Number(form.price); const sortOrder = Number(form.sortOrder);
      if (!form.name.trim()) throw new Error("Product name is required.");
      if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid non-negative price.");
      const payload = { name: form.name.trim(), description: form.description.trim(), category: form.category.trim() || "empanada", price, available: form.available, aliases: form.aliases.split(",").map((item) => item.trim()).filter(Boolean), imageUrl: form.imageUrl.trim(), sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100, tags: form.tags.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean), isFeatured: form.isFeatured, isNew: form.isNew };
      if (editingId) { await apiFetch(`/admin/products/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) }); setMessage("Product updated."); }
      else { await apiFetch("/admin/products", { method: "POST", body: JSON.stringify(payload) }); setMessage("Product added."); }
      reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save product."); }
    finally { setSaving(false); }
  }

  async function toggleAvailability(product: Product) {
    setError(null); setMessage(null);
    try { await apiFetch(`/admin/products/${product._id}`, { method: "PATCH", body: JSON.stringify({ available: !product.available }) }); setMessage(`${product.name} is now ${product.available ? "unavailable" : "available"}.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update availability."); }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Delete ${product.name}? Existing orders are not changed.`)) return;
    setError(null); setMessage(null);
    try { await apiFetch(`/admin/products/${product._id}`, { method: "DELETE" }); setMessage("Product deleted."); if (editingId === product._id) reset(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to delete product."); }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 text-sm text-foreground/45"><Link href="/settings" className="hover:text-foreground">Settings</Link> / Products</div><h1 className="text-3xl font-semibold tracking-tight">Products</h1><p className="mt-2 text-sm text-foreground/60">Manage the live product catalog used by ordering, pricing, and AI.</p></div>
        <Link href="/settings/ai-instructions"><Button variant="secondary">AI Instructions</Button></Link>
      </div>
      {error ? <div className="mb-5 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {message ? <div className="mb-5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm">{message}</div> : null}

      <Card className="mb-7 p-5 lg:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{editingId ? "Edit product" : "Add product"}</h2><p className="mt-1 text-sm text-foreground/50">Changes take effect across the customer menu, order validation, and AI.</p></div>{editingId ? <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button> : null}</div>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2 text-sm font-medium lg:col-span-2"><span>Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Beef" /></label>
          <label className="space-y-2 text-sm font-medium"><span>Price (₱)</span><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="35" /></label>
          <label className="space-y-2 text-sm font-medium"><span>Sort order</span><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
          <label className="space-y-2 text-sm font-medium md:col-span-2"><span>Description</span><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short product description" /></label>
          <label className="space-y-2 text-sm font-medium"><span>Category</span><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="empanada, sweet, drink..." /></label>
          <label className="space-y-2 text-sm font-medium"><span>Image URL</span><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" /></label>
          <label className="space-y-2 text-sm font-medium lg:col-span-2"><span>AI aliases</span><Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} placeholder="ube, ube cheese, ube empanada" /></label>
          <label className="space-y-2 text-sm font-medium lg:col-span-2"><span>Tags</span><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="best-seller, spicy, sweet" /><span className="block text-xs font-normal text-foreground/40">Comma-separated merchandising tags.</span></label>
          <div className="flex flex-wrap items-center gap-5 pt-2 lg:col-span-4">
            <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} /> Available for ordering</label>
            <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} /> Featured product</label>
            <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={form.isNew} onChange={(e) => setForm({ ...form, isNew: e.target.checked })} /> New product</label>
          </div>
          <div className="flex justify-end lg:col-span-4"><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? <><Pencil className="h-4 w-4" /> Save product</> : <><Plus className="h-4 w-4" /> Add product</>}</Button></div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.07] px-5 py-4"><h2 className="font-semibold">Product catalog</h2></div>
        {loading ? <div className="p-6 text-sm text-foreground/50">Loading products…</div> : products.length === 0 ? <div className="p-8 text-center text-sm text-foreground/50">No products found.</div> : <div className="divide-y divide-white/[0.06]">{products.map((product) => <div key={product._id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{product.name}</span><Badge>{product.available ? "Available" : "Unavailable"}</Badge>{product.isFeatured ? <Badge>Featured</Badge> : null}{product.isNew ? <Badge>New</Badge> : null}{product.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div><p className="mt-1 text-sm text-foreground/50">₱{Number(product.price).toFixed(2)} · {product.category}{product.description ? ` · ${product.description}` : ""}</p>{product.aliases.length ? <p className="mt-1 text-xs text-foreground/40">AI aliases: {product.aliases.join(", ")}</p> : null}</div>
          <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" onClick={() => void toggleAvailability(product)}>{product.available ? <><XCircle className="h-4 w-4" /> Mark unavailable</> : <><CheckCircle2 className="h-4 w-4" /> Mark available</>}</Button><Button variant="ghost" size="sm" onClick={() => edit(product)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="danger" size="sm" onClick={() => void remove(product)}><Trash2 className="h-4 w-4" /> Delete</Button></div>
        </div>)}</div>}
      </Card>
    </main>
  );
}
