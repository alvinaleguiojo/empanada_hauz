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

export default function ReferralSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await apiFetch<ReferralAuthResponse>("/referrals/partners/signup", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          phoneNumber: phoneNumber || undefined,
          password
        })
      });
      localStorage.setItem("empanada-referral-token", result.accessToken);
      document.cookie = `empanada-referral-token=${result.accessToken}; path=/; max-age=86400`;
      router.push((result.partner.approvalStatus === "approved" ? "/referrals/dashboard" : "/referrals/pending") as Route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create referral account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.24em] text-foreground/45">Empanada Hauz</p>
        <h1 className="mt-1 text-2xl font-semibold">Referral Signup</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required />
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" required />
          <Input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Phone number" />
          <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" minLength={8} required />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Referral Account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-foreground/55">
          Already have an account?{" "}
          <Link href={"/referrals/login" as Route} className="font-semibold text-accent">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
