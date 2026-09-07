export type AiToolRisk = "read" | "write";

export interface AiToolDefinition {
  name: string;
  description: string;
  risk: AiToolRisk;
  requiresCustomerContext?: boolean;
  requiresExplicitConfirmation?: boolean;
  inputSchema: Record<string, unknown>;
}

export interface AiToolExecutionContext {
  customerId: string;
  conversationId?: string;
  channel: string;
}

export interface AiToolHandler {
  definition: AiToolDefinition;
  execute(args: Record<string, unknown>, context: AiToolExecutionContext): Promise<unknown>;
}
