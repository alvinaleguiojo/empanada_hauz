import { AppShell } from "@/components/layout/app-shell";
import { DashboardFloatingWidgets } from "@/components/layout/dashboard-floating-widgets";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <DashboardFloatingWidgets />
    </AppShell>
  );
}
