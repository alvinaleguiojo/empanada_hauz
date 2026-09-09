import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { ProductsService } from "../products/products.service";
import { AiRuntimeService } from "./ai-runtime.service";
import { AiControlService } from "./ai-control.service";

export type AiModelProvider = "ollama" | "gemini" | "groq" | "openai";
export type AiModelSettings = { provider: AiModelProvider; model: string };

type RuntimeChat = (body: Record<string, unknown>) => Promise<unknown>;

type ProviderChoice = {
  message?: {
    content?: string | null;
    tool_calls?: Array<{ type?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }>;
  };
};

type ProviderResponse = { choices?: ProviderChoice[] };

@Injectable()
export class AiModelService {
  private readonly geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  private readonly groqBaseUrl = "https://api.groq.com/openai/v1/chat/completions";
  private readonly openAiBaseUrl = "https://api.openai.com/v1/chat/completions";

  constructor(
    private readonly config: ConfigService,
    private readonly aiControl: AiControlService
  ) {}

  createRuntime(
    stateService: AiConversationStateService,
    toolRegistry: AiToolRegistryService,
    instructionsService: AiInstructionsService,
    productsService: ProductsService
  ) {
    const runtime = new AiRuntimeService(this.config, stateService, toolRegistry, instructionsService, productsService);
    const runtimeWithChat = runtime as unknown as { chat: RuntimeChat };
    const ollamaChat = runtimeWithChat.chat.bind(runtime);
    runtimeWithChat.chat = async (body) => {
      const settings = await this.aiControl.getGlobalModelSettings();
      if (settings.provider === "gemini") return this.chatProvider(body, settings.model, "GEMINI_API_KEY", this.geminiBaseUrl, "Gemini");
      if (settings.provider === "groq") return this.chatProvider(body, settings.model, "GROQ_API_KEY", this.groqBaseUrl, "Groq");
      if (settings.provider === "openai") return this.chatOpenAi(body, settings.model);
      return ollamaChat(body);
    };
    return runtime;
  }

  async getSettings(): Promise<AiModelSettings> {
    return this.aiControl.getGlobalModelSettings();
  }

  async setSettings(provider: string, model: string) {
    if (provider !== "ollama" && provider !== "gemini" && provider !== "groq" && provider !== "openai") {
      throw new BadRequestException("AI provider must be ollama, gemini, groq, or openai.");
    }
    if (!model?.trim()) throw new BadRequestException("AI model is required.");
    return this.aiControl.setGlobalModelSettings(provider as AiModelProvider, model.trim());
  }

  private async chatProvider(
    body: Record<string, unknown>,
    model: string,
    apiKeyName: "GEMINI_API_KEY" | "GROQ_API_KEY",
    baseUrl: string,
    providerName: "Gemini" | "Groq"
  ) {
    const apiKey = this.config.get<string>(apiKeyName)?.trim();
    if (!apiKey) throw new BadRequestException(`${providerName} API key is not configured on the server.`);

    const options = body.options && typeof body.options === "object" ? body.options as Record<string, unknown> : {};
    const payload: Record<string, unknown> = {
      model,
      messages: body.messages,
      tools: body.tools,
      tool_choice: "auto"
    };

    if (typeof options.temperature === "number") payload.temperature = options.temperature;
    if (typeof options.num_predict === "number") payload.max_tokens = options.num_predict;
    if (body.format === "json") payload.response_format = { type: "json_object" };

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const responseBody = await response.text();
    if (!response.ok) throw new Error(`${providerName} runtime request failed: ${response.status} ${responseBody}`);
    const parsed = JSON.parse(responseBody) as ProviderResponse;
    const message = parsed.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).map((call) => ({
      ...call,
      function: call.function
        ? {
            ...call.function,
            arguments: typeof call.function.arguments === "string"
              ? call.function.arguments
              : JSON.stringify(call.function.arguments ?? {})
          }
        : undefined
    }));

    return {
      message: {
        content: message?.content ?? "",
        tool_calls: toolCalls
      }
    };
  }

  private async chatOpenAi(body: Record<string, unknown>, model: string) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) throw new BadRequestException("OpenAI API key is not configured on the server.");

    const options = body.options && typeof body.options === "object" ? body.options as Record<string, unknown> : {};
    const payload: Record<string, unknown> = {
      model,
      messages: body.messages,
      tools: body.tools,
      tool_choice: "auto"
    };

    // GPT-5.6 supports explicit reasoning control. Keep the runtime on the
    // no-reasoning path because this workload is primarily intent routing and
    // tool selection; the application services remain authoritative.
    payload.reasoning_effort = "none";

    if (typeof options.num_predict === "number") payload.max_completion_tokens = options.num_predict;
    if (body.format === "json") payload.response_format = { type: "json_object" };

    const configuredTimeout = Number(this.config.get<string>("OPENAI_TIMEOUT_MS", "60000"));
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 60000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.openAiBaseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });

      const responseBody = await response.text();
      if (!response.ok) throw new Error(`OpenAI runtime request failed: ${response.status} ${responseBody}`);
      const parsed = JSON.parse(responseBody) as ProviderResponse;
      const message = parsed.choices?.[0]?.message;
      const toolCalls = (message?.tool_calls ?? []).map((call) => ({
        ...call,
        function: call.function
          ? {
              ...call.function,
              arguments: typeof call.function.arguments === "string"
                ? call.function.arguments
                : JSON.stringify(call.function.arguments ?? {})
            }
          : undefined
      }));

      return {
        message: {
          content: message?.content ?? "",
          tool_calls: toolCalls
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}