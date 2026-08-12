"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type PartnerStatusResponse = {
  approved: boolean;
  partner: {
    name: string;
    email: string;
    approvalStatus: string;
  };
};

export default function ReferralPendingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function checkStatus() {
    setChecking(true);
    setError("");
    try {
      const token = window.localStorage.getItem("empanada-referral-token") ?? undefined;
      const result = await apiFetch<PartnerStatusResponse>("/referrals/partners/status", undefined, token);
      if (result.approved) {
        router.push("/referrals/dashboard" as Route);
        return;
      }
      setError("Your account is still pending approval.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to check approval status.");
    } finally {
      setChecking(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("empanada-referral-token");
    document.cookie = "empanada-referral-token=; path=/; max-age=0";
    router.push("/referrals/login" as Route);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-accent/25 bg-accent/[0.08] text-accent">
          <Clock size={22} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Approval Pending</h1>
        <p className="mt-2 text-sm leading-6 text-foreground/55">
          Your referral account has been created. An admin must approve it before your referral link and dashboard become active.
        </p>
        {error ? <p className="mt-4 rounded-lg border border-line/70 bg-black/10 px-3 py-2 text-sm text-foreground/65">{error}</p> : null}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={() => void checkStatus()} disabled={checking}>
            <RefreshCw size={17} className={checking ? "animate-spin" : undefined} />
            Check Status
          </Button>
          <Button type="button" variant="secondary" onClick={logout}>
            <LogOut size={17} />
            Logout
          </Button>
        </div>
      </Card>
    </main>
  );
}
