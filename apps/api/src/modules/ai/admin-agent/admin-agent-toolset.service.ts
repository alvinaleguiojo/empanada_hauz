import { Injectable } from "@nestjs/common";
import { AiToolDefinition } from "../ai-tool.types";

@Injectable()
export class AdminAgentToolsetService {
  select(tools: AiToolDefinition[], names?: string[]) {
    if (!names?.length) return tools;
    const allowed = new Set(names);
    return tools.filter((tool) => allowed.has(tool.name));
  }

  toModelDefinitions(tools: AiToolDefinition[]) {
    return tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
  }
}
