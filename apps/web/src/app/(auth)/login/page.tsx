"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setToken = useAuthStore((state) => state.setToken);
  const [email, setEmail] = useState("admin@empanadahauz.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const result = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(result.accessToken);
      localStorage.setItem("empanada-token", result.accessToken);
      document.cookie = `empanada-token=${result.accessToken}; path=/; max-age=86400`;
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-line/80 bg-white">
            <Image src="/empanada hauz logo.jpg" alt="Empanada Hauz" fill sizes="48px" className="object-cover" priority />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/45">Empanada Hauz</p>
            <h1 className="mt-1 text-2xl font-semibold">Operations Access</h1>
          </div>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Password"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" type="submit">
            Continue
          </Button>
        </form>
      </Card>
    </main>
  );
}
