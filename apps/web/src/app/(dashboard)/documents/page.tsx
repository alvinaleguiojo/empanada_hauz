"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { FileText, Folder, FolderPlus, Grid2X2, List, MoreVertical, Search, Trash2, Upload, Download } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type DocumentItem = { _id: string; name: string; type: "file" | "folder"; mimeType: string | null; size: number; folderId: string | null; public?: boolean; url?: string; source?: string | null; createdAt: string; updatedAt: string };

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(item: DocumentItem) { return item.type === "file" && Boolean(item.mimeType?.startsWith("image/")); }
function isPdf(item: DocumentItem) { return item.type === "file" && item.mimeType === "application/pdf"; }
function previewUrl(item: DocumentItem) {
  if (!item.url) return "";
  if (item.url.startsWith("data:") || item.url.startsWith("http://") || item.url.startsWith("https://")) return item.url;
  return `${API_URL}${item.url}`;
}

export default function DocumentsPage() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderTrail, setFolderTrail] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(nextFolderId = folderId, nextSearch = search) {
    setLoading(true);
    try { setItems(await apiFetch<DocumentItem[]>(`/documents?folderId=${encodeURIComponent(nextFolderId ?? "")}&search=${encodeURIComponent(nextSearch)}`)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load documents."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(null, ""); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(folderId, search); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const counts = useMemo(() => ({ folders: items.filter((item) => item.type === "folder").length, files: items.filter((item) => item.type === "file").length }), [items]);

  async function createFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    try { await apiFetch("/documents/folder", { method: "POST", body: JSON.stringify({ name, folderId }) }); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create folder."); }
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); event.target.value = "";
    if (!files.length) return;
    setUploading(true); setNotice(null);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is larger than 10 MB.`);
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`)); reader.readAsDataURL(file); });
        await apiFetch("/documents", { method: "POST", body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl, folderId, public: file.type.startsWith("image/"), source: "documents-page" }) });
      }
      setNotice(`${files.length} file${files.length === 1 ? "" : "s"} uploaded.`); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to upload files."); }
    finally { setUploading(false); }
  }

  async function remove(item: DocumentItem) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try { await apiFetch(`/documents/${item._id}`, { method: "DELETE" }); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to delete file."); }
  }

  async function openFile(item: DocumentItem) {
    if (item.type !== "file" || !item.url) return;
    if (item.public) { window.open(previewUrl(item), "_blank", "noopener,noreferrer"); return; }
    try {
      const token = window.localStorage.getItem("empanada-token");
      const response = await fetch(`${API_URL}/documents/${item._id}/download`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(await response.text());
      const blobUrl = URL.createObjectURL(await response.blob());
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to open file."); }
  }

  function openFolder(item: DocumentItem) {
    if (item.type !== "folder") return;
    setFolderTrail((current) => [...current, item]); setFolderId(item._id); void load(item._id, search);
  }
  function goHome() { setFolderTrail([]); setFolderId(null); void load(null, search); }
  function goTrail(index: number) { const nextTrail = folderTrail.slice(0, index + 1); const nextFolder = nextTrail[nextTrail.length - 1]?._id ?? null; setFolderTrail(nextTrail); setFolderId(nextFolder); void load(nextFolder, search); }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm text-foreground/45">Central storage for images, PDFs, attachments, and other files.</p><h1 className="text-3xl font-semibold tracking-tight">Documents</h1><p className="mt-2 text-sm text-foreground/55">A shared Drive-style library for Empanada Hauz.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={createFolder}><FolderPlus size={16} /> New folder</Button><label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,rgb(var(--accent)),#ff8a4d)] px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgb(var(--accent)/0.24)] ${uploading ? "pointer-events-none opacity-55" : ""}`}><Upload size={16} /> {uploading ? "Uploading…" : "Upload"}<input type="file" multiple className="sr-only" onChange={uploadFiles} /></label></div>
      </div>
      {notice ? <div className="mb-5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm">{notice}</div> : null}
      <Card className="mb-5 p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="flex items-center gap-2 text-sm text-foreground/55"><span className="font-medium text-foreground">My Drive</span>{folderTrail.map((item, index) => <span key={item._id} className="flex items-center gap-2"><span>/</span><button type="button" onClick={() => goTrail(index)} className="hover:text-foreground">{item.name}</button></span>)}</div><div className="flex flex-1 items-center gap-2 lg:justify-end"><div className="relative min-w-0 flex-1 lg:max-w-md"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" className="w-full rounded-xl border border-white/[0.1] bg-background px-9 py-2.5 text-sm outline-none focus:border-accent/50" /></div><div className="flex rounded-xl border border-white/[0.1] p-1"><button type="button" onClick={() => setView("grid")} className={`rounded-lg p-2 ${view === "grid" ? "bg-white/[0.1]" : ""}`} aria-label="Grid view"><Grid2X2 size={16} /></button><button type="button" onClick={() => setView("list")} className={`rounded-lg p-2 ${view === "list" ? "bg-white/[0.1]" : ""}`} aria-label="List view"><List size={16} /></button></div></div></div></Card>
      <div className="mb-4 flex items-center justify-between text-xs text-foreground/40"><span>{counts.folders} folder{counts.folders === 1 ? "" : "s"} · {counts.files} file{counts.files === 1 ? "" : "s"}</span>{folderId ? <button type="button" onClick={goHome} className="hover:text-foreground">Back to My Drive</button> : null}</div>
      {loading ? <Card className="p-10 text-center text-sm text-foreground/45">Loading your files…</Card> : items.length === 0 ? <Card className="p-12 text-center"><Folder className="mx-auto h-10 w-10 text-foreground/20" /><h2 className="mt-4 font-semibold">This folder is empty</h2><p className="mt-1 text-sm text-foreground/45">Upload a file or create a folder to get started.</p></Card> : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{items.map((item) => <Card key={item._id} className="group relative overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-accent/30"><button type="button" onClick={() => item.type === "folder" ? openFolder(item) : void openFile(item)} className="block w-full text-left"><div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-white/[0.03]">{isImage(item) ? <img loading="lazy" decoding="async" src={previewUrl(item)} alt={item.name} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : item.type === "folder" ? <Folder className="h-14 w-14 text-accent/80" /> : <FileText className="h-14 w-14 text-foreground/30" />}</div><div className="p-4"><p className="truncate text-sm font-semibold" title={item.name}>{item.name}</p><p className="mt-1 text-xs text-foreground/40">{item.type === "folder" ? "Folder" : isPdf(item) ? "PDF" : item.mimeType || "File"}{item.type === "file" ? ` · ${formatBytes(item.size)}` : ""}</p></div></button>{item.type === "file" ? <button type="button" onClick={() => void openFile(item)} className="absolute right-2 top-2 rounded-lg border border-white/[0.1] bg-black/60 p-2 text-white opacity-0 transition group-hover:opacity-100" aria-label="Open"><Download size={15} /></button> : null}<button type="button" onClick={() => void remove(item)} className="absolute bottom-2 right-2 rounded-lg bg-black/55 p-2 text-white opacity-0 transition group-hover:opacity-100" aria-label="Delete"><Trash2 size={14} /></button></Card>)}</div>
      ) : (
        <Card className="overflow-hidden p-0"><div className="grid grid-cols-[minmax(0,1fr)_120px_120px_56px] border-b border-white/[0.07] px-4 py-3 text-xs uppercase tracking-[0.14em] text-foreground/35"><span>Name</span><span>Type</span><span>Size</span><span /></div>{items.map((item) => <div key={item._id} className="grid grid-cols-[minmax(0,1fr)_120px_120px_56px] items-center border-b border-white/[0.05] px-4 py-3 last:border-b-0"><button type="button" onClick={() => item.type === "folder" ? openFolder(item) : void openFile(item)} className="flex min-w-0 items-center gap-3 text-left"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.04]"><>{isImage(item) ? <img loading="lazy" decoding="async" src={previewUrl(item)} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : item.type === "folder" ? <Folder size={18} className="text-accent" /> : <FileText size={18} className="text-foreground/35" />}</></span><span className="truncate text-sm font-medium">{item.name}</span></button><span className="text-xs text-foreground/45">{item.type === "folder" ? "Folder" : item.mimeType || "File"}</span><span className="text-xs text-foreground/45">{item.type === "folder" ? "—" : formatBytes(item.size)}</span><button type="button" onClick={() => void remove(item)} className="justify-self-end rounded-lg p-2 text-foreground/40 hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${item.name}`}><MoreVertical size={16} /></button></div>)}</Card>
      )}
    </main>
  );
}
