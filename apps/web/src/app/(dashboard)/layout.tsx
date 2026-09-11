import { AppShell } from "@/components/layout/app-shell";
import { FloatingAiAgent } from "@/components/ai-admin/floating-ai-agent";
import { FloatingMessenger } from "@/components/messenger/floating-messenger";
import { FloatingOperatorChat } from "@/components/communication/floating-operator-chat";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <FloatingMessenger />
      <FloatingAiAgent />
      <FloatingOperatorChat />
    </AppShell>
  );
}
