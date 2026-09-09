import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { ProductsService } from "../products/products.service";
import { AiRuntimeService } from "./ai-runtime.service";
import { AiControlService } from "./ai-control.service";

export type AiModelProvider = "ollama" | "gemini";
export type AiModelSettings = { provider: AiModelProvider; model: string };

type RuntimeChat = (body: Record<string, unknown>) => Promise<unknown>;

type GeminiChoice = {
  message?: {
    content?: string | null;
    tool_calls?: Array<{ type?: string; function?: { name?: string; arguments?: Record<string, unknown> } }>;
  };
};

type GeminiResponse = { choices?: GeminiChoice[] };

@Injectable()
export class AiModelService {
  private readonly geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

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
      if (settings.provider !== "gemini") return ollamaChat(body);
      return this.chatGemini(body, settings.model);
    };
    return runtime;
  }

  async getSettings(): Promise<AiModelSettings> {
    return this.aiControl.getGlobalModelSettings();
  }

  async setSettings(provider: string, model: string) {
    if (provider !== "ollama" && provider !== "gemini") {
      throw new BadRequestException("AI provider must be ollama or gemini.");
    }
    if (!model?.trim()) throw new BadRequestException("AI model is required.");
    return this.aiControl.setGlobalModelSettings(provider, model.trim());
  }

  private async chatGemini(body: Record<string, unknown>, model: string) {
    const apiKey = this.config.get<string>("GEMINI_API_KEY")?.trim();
    if (!apiKey) throw new BadRequestException("Gemini API key is not configured on the server.");

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

    const response = await fetch(this.geminiBaseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const responseBody = await response.text();
    if (!response.ok) throw new Error(`Gemini runtime request failed: ${response.status} ${responseBody}`);
    const parsed = JSON.parse(responseBody) as GeminiResponse;
    const message = parsed.choices?.[0]?.message;

    return {
      message: {
        content: message?.content ?? "",
        tool_calls: message?.tool_calls ?? []
      }
    };
  }
}
