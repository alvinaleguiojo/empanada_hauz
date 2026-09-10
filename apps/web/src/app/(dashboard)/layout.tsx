import Link from "next/link";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { FloatingAiAgent } from "@/components/ai-admin/floating-ai-agent";
import { FloatingMessenger } from "@/components/messenger/floating-messenger";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <FloatingMessenger />
      <FloatingAiAgent />
      <Link
        href="/documents"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-background/95 px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur transition hover:border-accent/40 hover:bg-background"
        aria-label="Open Documents"
      >
        <FileText size={17} />
        Documents
      </Link>
    </AppShell>
  );
}
