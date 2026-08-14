import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReferralChat } from "@/components/referrals/referral-chat";

export default async function ReferralChatPage() {
  const token = (await cookies()).get("empanada-referral-token")?.value;
  if (!token) redirect("/referrals/login");
  return <main className="min-h-screen p-4 text-foreground sm:p-6"><div className="mx-auto max-w-6xl space-y-5"><div className="flex items-end justify-between gap-3"><div><p className="text-sm text-foreground/55">Need help with your referrals?</p><h1 className="text-3xl font-semibold">Chat with Admin</h1></div><Link href="/referrals/dashboard" className="text-sm font-semibold text-accent">Back to dashboard</Link></div><ReferralChat mode="partner" tokenStorageKey="empanada-referral-token" /></div></main>;
}
