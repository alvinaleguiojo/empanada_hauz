import { AppShell } from "@/components/layout/app-shell";
import { FloatingMessenger } from "@/components/messenger/floating-messenger";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <FloatingMessenger />
    </AppShell>
  );
}
