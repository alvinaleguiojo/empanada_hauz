"use client";

import dynamic from "next/dynamic";

const FloatingMessenger = dynamic(
  () => import("@/components/messenger/floating-messenger").then((mod) => mod.FloatingMessenger),
  { loading: () => null, ssr: false }
);

const FloatingAiAgent = dynamic(
  () => import("@/components/ai-admin/floating-ai-agent").then((mod) => mod.FloatingAiAgent),
  { loading: () => null, ssr: false }
);

const FloatingOperatorChat = dynamic(
  () => import("@/components/communication/floating-operator-chat").then((mod) => mod.FloatingOperatorChat),
  { loading: () => null, ssr: false }
);

export function DashboardFloatingWidgets() {
  return (
    <>
      <FloatingMessenger />
      <FloatingAiAgent />
      <FloatingOperatorChat />
    </>
  );
}
