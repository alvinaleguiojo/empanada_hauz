"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function RiderLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("empanada-rider-token");
    if (token) router.replace("/rider");
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<{ accessToken: string; user: { role: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      }, undefined, "empanada-token");

      if (result.user.role !== "rider") {
        throw new Error("This login is for rider accounts only.");
      }

      localStorage.removeItem("empanada-token");
      document.cookie = "empanada-token=; path=/; max-age=0";
      localStorage.setItem("empanada-rider-token", result.accessToken);
      document.cookie = `empanada-rider-token=${result.accessToken}; path=/; max-age=86400; samesite=lax`;
      router.replace("/rider" as Route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF6EC] px-4 py-8 text-[#241C18] sm:flex sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-[30px] bg-white p-6 shadow-[0_18px_45px_rgba(59,29,15,0.12)] ring-1 ring-[#F0E4D6] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-[#FFE3D2] ring-4 ring-[#FFE3D2]">
            <Image src="/empanada hauz logo.jpg" alt="Empanada Hauz" fill sizes="64px" className="object-cover" priority />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[#8A817A]">Empanada Hauz</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Rider Login</h1>
          <p className="mt-2 text-sm text-[#8A817A]">Sign in to access your deliveries, map, and rider profile.</p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit} autoComplete="off">
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#8A817A]">Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-[#F0E4D6] bg-[#FFF6EC] px-4 py-3.5 text-sm outline-none transition focus:border-[#F4581D]" type="email" required autoComplete="username" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#8A817A]">Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-[#F0E4D6] bg-[#FFF6EC] px-4 py-3.5 text-sm outline-none transition focus:border-[#F4581D]" type="password" required autoComplete="current-password" />
          </label>
          {error ? <div className="rounded-2xl bg-[#FDE9E7] px-4 py-3 text-sm font-semibold text-[#D5473A]">{error}</div> : null}
          <button disabled={loading} className="w-full rounded-2xl bg-[#F4581D] px-4 py-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(244,88,29,0.24)] transition hover:bg-[#D9430F] disabled:cursor-not-allowed disabled:opacity-60" type="submit">
            {loading ? "Signing in…" : "Sign in as Rider"}
          </button>
        </form>
      </div>
    </main>
  );
}
