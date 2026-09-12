import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiConversationStateService } from "./ai-conversation-state.service";
import { AiInstructionsService } from "../ai-instructions/ai-instructions.service";
import { AiToolRegistryService } from "./ai-tool-registry.service";
import { ProductsService } from "../products/products.service";
import { AiRuntimeService } from "./ai-runtime.service";
import { AiControlService } from "./ai-control.service";

export type AiModelProvider = "ollama" | "gemini" | "groq" | "openai" | "openrouter";
export type AiModelSettings = { provider: AiModelProvider; model: string };
export type GeneratedProduct = { name: string; description: string; category: string; price: number; aliases: string[]; tags: string[]; isFeatured: boolean; isNew: boolean };
type RuntimeChat = (body: Record<string, unknown>) => Promise<unknown>;
type ProviderChoice = { message?: { content?: string | null; tool_calls?: Array<{ type?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }> } };
type ProviderResponse = { choices?: ProviderChoice[] };

@Injectable()
export class AiModelService {
  private readonly geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  private readonly groqBaseUrl = "https://api.groq.com/openai/v1/chat/completions";
  private readonly openAiBaseUrl = "https://api.openai.com/v1/chat/completions";
  private readonly openRouterBaseUrl = "https://openrouter.ai/api/v1/chat/completions";

  constructor(private readonly config: ConfigService, private readonly aiControl: AiControlService) {}

  createRuntime(stateService: AiConversationStateService, toolRegistry: AiToolRegistryService, instructionsService: AiInstructionsService, productsService: ProductsService) {
    const runtime = new AiRuntimeService(this.config, stateService, toolRegistry, instructionsService, productsService);
    const runtimeWithChat = runtime as unknown as { chat: RuntimeChat };
    const ollamaChat = runtimeWithChat.chat.bind(runtime);
    runtimeWithChat.chat = async (body) => {
      const settings = await this.aiControl.getGlobalModelSettings();
      if (settings.provider === "gemini") return this.chatProvider(body, settings.model, "GEMINI_API_KEY", this.geminiBaseUrl, "Gemini");
      if (settings.provider === "groq") return this.chatProvider(body, settings.model, "GROQ_API_KEY", this.groqBaseUrl, "Groq");
      if (settings.provider === "openai") return this.chatOpenAi(body, settings.model);
      if (settings.provider === "openrouter") return this.chatOpenRouter(body, settings.model);
      return ollamaChat(body);
    };
    return runtime;
  }

  async getSettings(): Promise<AiModelSettings> { return this.aiControl.getGlobalModelSettings(); }

  async setSettings(provider: string, model: string) {
    if (!["ollama", "gemini", "groq", "openai", "openrouter"].includes(provider)) throw new BadRequestException("AI provider must be ollama, gemini, groq, openai, or openrouter.");
    if (!model?.trim()) throw new BadRequestException("AI model is required.");
    return this.aiControl.setGlobalModelSettings(provider as AiModelProvider, model.trim());
  }

  async generateProduct(prompt: string, existingProducts: Array<{ name: string; category: string }>): Promise<GeneratedProduct> {
    if (!prompt?.trim()) throw new BadRequestException("Describe the product you want to create.");
    const settings = await this.aiControl.getGlobalModelSettings();
    const catalog = existingProducts.slice(0, 100).map((product) => `${product.name} (${product.category})`).join(", ");
    const body: Record<string, unknown> = {
      messages: [
        { role: "system", content: "You generate product catalog entries for a Philippine empanada business. Return ONLY valid JSON. Create a new product rather than copying an existing product name. Use Philippine peso pricing as a numeric amount. Keep descriptions concise and appetizing." },
        { role: "user", content: `Create one new product from this request: ${prompt.trim()}\n\nExisting catalog: ${catalog || "empty"}\n\nReturn exactly these fields: name (string), description (string), category (string), price (number), aliases (string[]), tags (string[]), isFeatured (boolean), isNew (boolean). Choose a sensible price and category if not specified.` }
      ],
      format: "json",
      options: { temperature: 0.7, num_predict: 700 }
    };
    let response: unknown;
    if (settings.provider === "gemini") response = await this.chatProvider(body, settings.model, "GEMINI_API_KEY", this.geminiBaseUrl, "Gemini");
    else if (settings.provider === "groq") response = await this.chatProvider(body, settings.model, "GROQ_API_KEY", this.groqBaseUrl, "Groq");
    else if (settings.provider === "openai") response = await this.chatOpenAi(body, settings.model);
    else if (settings.provider === "openrouter") response = await this.chatOpenRouter(body, settings.model);
    else response = await this.chatOllama(body, settings.model);
    const content = (response as { message?: { content?: string } })?.message?.content?.trim();
    if (!content) throw new Error("AI returned an empty product.");
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid product JSON."); }
    if (!parsed || typeof parsed !== "object") throw new Error("AI returned an invalid product.");
    const value = parsed as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const description = typeof value.description === "string" ? value.description.trim() : "";
    const category = typeof value.category === "string" ? value.category.trim() : "empanada";
    const price = Number(value.price);
    if (!name || !description || !Number.isFinite(price) || price < 0) throw new Error("AI returned incomplete product data.");
    return {
      name, description, category: category || "empanada", price: Math.round(price * 100) / 100,
      aliases: Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8) : [],
      tags: Array.isArray(value.tags) ? value.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 8) : [],
      isFeatured: value.isFeatured === true, isNew: value.isNew !== false
    };
  }

  private async chatOllama(body: Record<string, unknown>, model: string) {
    const baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    const configuredTimeout = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "120000"));
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 120000;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify({ model, messages: body.messages, temperature: 0.7, max_tokens: 700, response_format: body.format === "json" ? { type: "json_object" } : undefined }) });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`Ollama product generation failed: ${response.status} ${responseBody}`);
      const parsed = JSON.parse(responseBody) as ProviderResponse; return { message: { content: parsed.choices?.[0]?.message?.content ?? "" } };
    } finally { clearTimeout(timeout); }
  }

  private async chatProvider(body: Record<string, unknown>, model: string, apiKeyName: "GEMINI_API_KEY" | "GROQ_API_KEY", baseUrl: string, providerName: "Gemini" | "Groq") {
    const apiKey = this.config.get<string>(apiKeyName)?.trim();
    if (!apiKey) throw new BadRequestException(`${providerName} API key is not configured on the server.`);
    const options = body.options && typeof body.options === "object" ? body.options as Record<string, unknown> : {};
    const payload: Record<string, unknown> = { model, messages: body.messages, tools: body.tools, tool_choice: "auto" };
    if (typeof options.temperature === "number") payload.temperature = options.temperature;
    if (typeof options.num_predict === "number") payload.max_tokens = options.num_predict;
    if (body.format === "json") payload.response_format = { type: "json_object" };
    const response = await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
    const responseBody = await response.text();
    if (!response.ok) throw new Error(`${providerName} runtime request failed: ${response.status} ${responseBody}`);
    const parsed = JSON.parse(responseBody) as ProviderResponse; const message = parsed.choices?.[0]?.message;
    return { message: { content: message?.content ?? "", tool_calls: (message?.tool_calls ?? []).map((call) => ({ ...call, function: call.function ? { ...call.function, arguments: typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}) } : undefined })) } };
  }

  private async chatOpenAi(body: Record<string, unknown>, model: string) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) throw new BadRequestException("OpenAI API key is not configured on the server.");
    const options = body.options && typeof body.options === "object" ? body.options as Record<string, unknown> : {};
    const payload: Record<string, unknown> = { model, messages: body.messages, tools: body.tools, tool_choice: "auto", reasoning_effort: "none" };
    if (typeof options.num_predict === "number") payload.max_completion_tokens = options.num_predict;
    if (body.format === "json") payload.response_format = { type: "json_object" };
    const configuredTimeout = Number(this.config.get<string>("OPENAI_TIMEOUT_MS", "60000")); const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 60000;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.openAiBaseUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${apiKey}` }, signal: controller.signal, body: JSON.stringify(payload) });
      const responseBody = await response.text(); if (!response.ok) throw new Error(`OpenAI runtime request failed: ${response.status} ${responseBody}`);
      const parsed = JSON.parse(responseBody) as ProviderResponse; const message = parsed.choices?.[0]?.message;
      return { message: { content: message?.content ?? "", tool_calls: (message?.tool_calls ?? []).map((call) => ({ ...call, function: call.function ? { ...call.function, arguments: typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}) } : undefined })) } };
    } finally { clearTimeout(timeout); }
  }

  private async chatOpenRouter(body: Record<string, unknown>, model: string) {
    const apiKey = this.config.get<string>("OPENROUTER_API_KEY")?.trim();
    if (!apiKey) throw new BadRequestException("OpenRouter API key is not configured on the server.");
    const options = body.options && typeof body.options === "object" ? body.options as Record<string, unknown> : {};
    const payload: Record<string, unknown> = { model, messages: body.messages, tools: body.tools, tool_choice: "auto" };
    if (typeof options.temperature === "number") payload.temperature = options.temperature;
    if (typeof options.num_predict === "number") payload.max_tokens = options.num_predict;
    if (body.format === "json") payload.response_format = { type: "json_object" };
    const response = await fetch(this.openRouterBaseUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${apiKey}`, "HTTP-Referer": this.config.get<string>("OPENROUTER_SITE_URL") ?? "https://www.empanadahauz.com", "X-Title": this.config.get<string>("OPENROUTER_APP_NAME") ?? "Empanada Hauz Admin AI" }, body: JSON.stringify(payload) });
    const responseBody = await response.text();
    if (!response.ok) throw new Error(`OpenRouter runtime request failed: ${response.status} ${responseBody}`);
    const parsed = JSON.parse(responseBody) as ProviderResponse; const message = parsed.choices?.[0]?.message;
    return { message: { content: message?.content ?? "", tool_calls: (message?.tool_calls ?? []).map((call) => ({ ...call, function: call.function ? { ...call.function, arguments: typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}) } : undefined })) } };
  }
}
