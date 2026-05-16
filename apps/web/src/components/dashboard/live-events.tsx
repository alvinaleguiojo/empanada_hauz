"use client";

import { Card } from "@/components/ui/card";
import { useRealtimeStore } from "@/store/realtime-store";

export function LiveEvents() {
  const events = useRealtimeStore((state) => state.events);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Realtime Activity</h3>
        <span className="text-xs text-success">Live</span>
      </div>
      <div className="space-y-3">
        {events.length === 0 ? <p className="text-sm text-foreground/55">Waiting for Socket.IO events.</p> : null}
        {events.map((event, index) => (
          <div key={`${event.timestamp}-${index}`} className="rounded-lg border border-line/75 bg-black/[0.06] px-3 py-2">
            <p className="text-sm font-medium">{event.event}</p>
            <p className="text-xs text-foreground/45">{event.timestamp}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
