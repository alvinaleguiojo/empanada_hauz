import { BadRequestException, Injectable } from "@nestjs/common";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  parseError?: string;
}

export interface AgentRunInput {
  system: string;
  runtimeContext?: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  message: string;
  tools: Array<Record<string, unknown>>;
  chat: (messages: Array<Record<string, unknown>>, tools: Array<Record<string, unknown>>) => Promise<unknown>;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
  onToolResult?: (name: string, args: Record<string, unknown>, result: unknown) => Promise<void> | void;
}

export interface AgentRunResult {
  reply: string;
  tool?: string;
  toolResult?: unknown;
  iterations: number;
}

@Injectable()
export class AiAgentOrchestratorService {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: input.system },
      ...(input.runtimeContext ? [{ role: "system", content: input.runtimeContext }] : []),
      ...(input.history ?? []).slice(-12),
      { role: "user", content: input.message }
    ];

    let lastTool: string | undefined;
    let lastToolResult: unknown;
    const maxSteps = Math.max(1, Math.min(input.maxSteps ?? 5, 8));

    for (let step = 0; step < maxSteps; step += 1) {
      const response = await input.chat(messages, input.tools);
      const content = readContent(response);
      const calls = readToolCalls(response);

      if (!calls.length) {
        return {
          reply: sanitizeCustomerReply(content, lastTool, lastToolResult),
          tool: lastTool,
          toolResult: lastToolResult,
          iterations: step + 1
        };
      }

      messages.push({
        role: "assistant",
        content,
        tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }))
      });

      for (const call of calls) {
        lastTool = call.name;
        let result: unknown;
        try {
          if (call.parseError) throw new BadRequestException(call.parseError);
          result = await input.executeTool(call.name, call.arguments);
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : "Tool execution failed." };
        }

        lastToolResult = result;
        await input.onToolResult?.(call.name, call.arguments, result);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return { reply: "I reached the tool execution limit before completing that request.", tool: lastTool, toolResult: lastToolResult, iterations: maxSteps };
  }
}

function sanitizeCustomerReply(value: string, lastTool?: string, lastToolResult?: unknown) {
  const text = extractCustomerText(value);
  if (!text) return fallbackCustomerReply(lastTool, lastToolResult);
  if (claimsMutationSuccess(text) && !hasSuccessfulMutation(lastTool, lastToolResult)) return fallbackCustomerReply(lastTool, lastToolResult);
  if (lastTool === "cancel_order" && !hasSuccessfulCancellation(lastToolResult) && claimsCancellationSuccess(text)) {
    return "I was unable to confirm the cancellation because the application did not confirm it. Please try again.";
  }
  return text;
}

function extractCustomerText(value: string) {
  const cleaned = String(value ?? "").replace(/^```(?:json|text|markdown)?/i, "").replace(/```$/i, "").trim();
  if (!cleaned) return "";
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      for (const key of ["reply", "message", "text"]) {
        if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
      }
    }
  } catch {}
  return cleaned;
}

function claimsMutationSuccess(text: string) {
  return /(?:order\s+(?:has been|was|is)\s+(?:cancelled|canceled|updated|rescheduled|created|placed|submitted|accepted|received|completed|deleted)|(?:successfully|success)\s+(?:cancelled|canceled|updated|rescheduled|created|placed|submitted|deleted)|(?:cancelled|canceled|updated|rescheduled|created|placed|submitted|deleted)\s+successfully)/i.test(text);
}

function claimsCancellationSuccess(text: string) {
  return /(?:order\s+(?:has been|was|is)\s+(?:cancelled|canceled)|(?:successfully|success)\s+(?:cancelled|canceled)|(?:cancelled|canceled)\s+successfully)/i.test(text);
}

function hasSuccessfulMutation(tool: string | undefined, result: unknown) {
  if (!tool || !result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (record.ok === false || typeof record.error === "string") return false;
  if (tool === "create_order") return typeof record.id === "string" && typeof record.orderNumber === "string";
  if (tool === "cancel_order") return record.status === "cancelled" || record.status === "canceled";
  if (tool === "update_order" || tool === "reschedule_order") return typeof record.id === "string" || typeof record.orderNumber === "string";
  return tool !== "delete_order";
}

function hasSuccessfulCancellation(result: unknown) {
  return hasSuccessfulMutation("cancel_order", result);
}

function fallbackCustomerReply(lastTool?: string, lastToolResult?: unknown) {
  if (lastTool === "cancel_order" && !hasSuccessfulCancellation(lastToolResult)) return "I could not confirm the cancellation yet. I will only tell you it was cancelled after the application succeeds. 😊";
  if (lastTool && !hasSuccessfulMutation(lastTool, lastToolResult) && ["create_order", "update_order", "reschedule_order", "delete_order"].includes(lastTool)) return "I could not confirm that change yet. I will only confirm it after the application succeeds. 😊";
  return "How can I help you with your Empanada Hauz order? 😊";
}

function readContent(response: unknown) {
  const value = response as {
    content?: string;
    message?: { content?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  return value?.content?.trim() || value?.message?.content?.trim() || value?.choices?.[0]?.message?.content?.trim() || "";
}

function readToolCalls(response: unknown): AgentToolCall[] {
  type Shape = { id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } };
  const value = response as {
    tool_calls?: Shape[];
    message?: { tool_calls?: Shape[] };
    choices?: Array<{ message?: { tool_calls?: Shape[] } }>;
  };
  const calls = value?.tool_calls ?? value?.message?.tool_calls ?? value?.choices?.[0]?.message?.tool_calls ?? [];

  return calls.flatMap((call, index) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    const id = call.id || `tool-${index}`;
    try {
      const raw = call.function?.arguments ?? "{}";
      const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return [{ id, name, arguments: {}, parseError: "Tool arguments must be a JSON object." }];
      }
      return [{ id, name, arguments: parsed as Record<string, unknown> }];
    } catch {
      return [{ id, name, arguments: {}, parseError: "The model returned invalid JSON tool arguments." }];
    }
  });
}
