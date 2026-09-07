import { redirect } from "next/navigation";

export default function AiActionsLegacyPage() {
  redirect("/settings/ai-instructions?tab=actions");
}
