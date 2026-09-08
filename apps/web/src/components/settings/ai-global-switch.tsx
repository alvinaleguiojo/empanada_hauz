"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default function AiGlobalSwitch() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setError("");
      try {
        const state = await apiFetch<{ enabled: boolean }>("/messenger/ai/settings");
        if (active) setEnabled(state.enabled);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load the global AI setting.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function toggle() {
    setSaving(true);
    setError("");
    const previous = enabled;
    setEnabled(!enabled);
    try {
      const state = await apiFetch<{ enabled: boolean }>("/messenger/ai/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled: !enabled })
      });
      setEnabled(state.enabled);
    } catch (err) {
      setEnabled(previous);
      setError(err instanceof Error ? err.message : "Unable to update the global AI setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 border-line/80 bg-background/80 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Bot size={19} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Global AI</h2>
            <p className="mt-1 text-xs text-foreground/50">Master switch for automatic Messenger AI replies across customers.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saving ? <Loader2 size={15} className="animate-spin text-foreground/45" /> : null}
          <Button
            type="button"
            size="sm"
            variant={enabled ? "default" : "outline"}
            disabled={loading || saving}
            onClick={() => void toggle()}
            className="h-9 min-w-20 px-4"
          >
            {loading ? "Loading…" : enabled ? "ON" : "OFF"}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </Card>
  );
}
