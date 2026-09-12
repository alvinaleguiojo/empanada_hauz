import { BadRequestException, Injectable } from "@nestjs/common";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  parseError?: string;
}

export interface AgentRunInput {
  system: string;
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
      ...(input.history ?? []).slice(-16),
      { role: "user", content: input.message }
    ];

    let lastTool: string | undefined;
    let lastToolResult: unknown;
    const maxSteps = Math.max(1, Math.min(input.maxSteps ?? 8, 12));

    for (let step = 0; step < maxSteps; step += 1) {
      const response = await input.chat(messages, input.tools);
      const content = readContent(response);
      const calls = readToolCalls(response);

      if (!calls.length) {
        return { reply: content || "I couldn't produce a response.", tool: lastTool, toolResult: lastToolResult, iterations: step + 1 };
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
