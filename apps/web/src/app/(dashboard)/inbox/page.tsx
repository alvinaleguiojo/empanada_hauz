import { InboxList } from "@/components/messenger/inbox-list";
import { AiControlPanel } from "@/components/messenger/ai-control-panel";
import { apiFetch } from "@/lib/api";

export default async function InboxPage() {
  const conversations = await apiFetch<any[]>("/messenger/conversations").catch(() => []);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-foreground/55">Messenger conversations and repeat customer context.</p>
        <h1 className="text-3xl font-semibold">Inbox</h1>
      </div>
      <AiControlPanel />
      <InboxList initialConversations={conversations} />
    </div>
  );
}
