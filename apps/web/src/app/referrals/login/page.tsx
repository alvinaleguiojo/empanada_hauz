"use client";

import { FormEvent, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type ReferralAuthResponse = {
  accessToken: string;
  partner: {
    approvalStatus?: string;
  };
};

export default function ReferralLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await apiFetch<ReferralAuthResponse>("/referrals/partners/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("empanada-referral-token", result.accessToken);
      document.cookie = `empanada-referral-token=${result.accessToken}; path=/; max-age=86400`;
      router.push((result.partner.approvalStatus === "approved" ? "/referrals/dashboard" : "/referrals/pending") as Route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.24em] text-foreground/45">Empanada Hauz</p>
        <h1 className="mt-1 text-2xl font-semibold">Referral Login</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" required />
          <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" required />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Continue"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-foreground/55">
          Need an account?{" "}
          <Link href={"/referrals/signup" as Route} className="font-semibold text-accent">
            Sign up
          </Link>
        </p>
      </Card>
    </main>
  );
}
