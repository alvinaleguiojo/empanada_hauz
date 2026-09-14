import { AppShell } from "@/components/layout/app-shell";
import { DashboardFloatingWidgets } from "@/components/layout/dashboard-floating-widgets";
import { FraudSidebarLink } from "@/components/layout/fraud-sidebar-link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <FraudSidebarLink />
      {children}
      <DashboardFloatingWidgets />
    </AppShell>
  );
}
