"use client";

import Link from "next/link";
import { ReferralChat } from "@/components/referrals/referral-chat";

export default function AdminReferralChatPage() {
  return <main className="min-h-screen p-4 text-foreground sm:p-6"><div className="mx-auto max-w-6xl space-y-5"><div className="flex items-end justify-between gap-3"><div><p className="text-sm text-foreground/55">Communicate with your referral network.</p><h1 className="text-3xl font-semibold">Referral Chat</h1></div><Link href="/referrals" className="text-sm font-semibold text-accent">Back to referrals</Link></div><ReferralChat mode="admin" tokenStorageKey="empanada-token" /></div></main>;
}
