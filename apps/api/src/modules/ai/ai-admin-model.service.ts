import { GatewayTimeoutException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiControlService } from "./ai-control.service";

type ModelSettings = Awaited<ReturnType<AiControlService["getGlobalModelSettings"]>>;

@Injectable()
export class AiAdminModelService {
  private readonly geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  private readonly groqBaseUrl = "https://api.groq.com/openai/v1/chat/completions";
  private readonly openAiBaseUrl = "https://api.openai.com/v1/chat/completions";
  private readonly openRouterBaseUrl = "https://openrouter.ai/api/v1/chat/completions";
  private cachedSettings?: { value: ModelSettings; expiresAt: number };
  private readonly settingsTtlMs = 30_000;

  constructor(private readonly config: ConfigService, private readonly aiControl: AiControlService) {}

  async chat(messages: Array<Record<string, unknown>>, tools: Array<Record<string, unknown>>) {
    const settings = await this.getCachedSettings();
    const body = { model: settings.model, messages, tools, tool_choice: "auto" };
    if (settings.provider === "gemini") return this.chatProvider(body, this.geminiBaseUrl, "GEMINI_API_KEY", "Gemini");
    if (settings.provider === "groq") return this.chatProvider(body, this.groqBaseUrl, "GROQ_API_KEY", "Groq");
    if (settings.provider === "openai") return this.chatProvider(body, this.openAiBaseUrl, "OPENAI_API_KEY", "OpenAI");
    if (settings.provider === "openrouter") return this.chatOpenRouter(body);
    return this.chatOllama(body);
  }

  private async getCachedSettings() {
    if (this.cachedSettings && this.cachedSettings.expiresAt > Date.now()) return this.cachedSettings.value;
    const value = await this.aiControl.getGlobalModelSettings();
    this.cachedSettings = { value, expiresAt: Date.now() + this.settingsTtlMs };
    return value;
  }

  private async chatOllama(body: Record<string, unknown>) {
    const baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    const timeoutMs = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "300000"));
    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? timeoutMs : 300000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      const requestBody = { ...body, think: false, options: { temperature: 0, num_ctx: 4096 } };
      const response = await this.modelFetch(`${baseUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify(requestBody) }, "Ollama");
      const text = await response.text();
      if (!response.ok) throw new Error(`Ollama admin agent request failed: ${response.status} ${text}`);
      const parsed = JSON.parse(text) as { choices?: Array<{ message?: unknown }> };
      return parsed.choices?.[0]?.message ?? { content: "" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GatewayTimeoutException(`Ollama did not respond within ${Math.round(effectiveTimeoutMs / 1000)} seconds. Check that the selected model is running and responsive, or increase OLLAMA_TIMEOUT_MS.`);
      }
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private async chatProvider(body: Record<string, unknown>, url: string, keyName: "GEMINI_API_KEY" | "GROQ_API_KEY" | "OPENAI_API_KEY", provider: string) {
    const key = this.config.get<string>(keyName)?.trim();
    if (!key) throw new Error(`${provider} API key is not configured on the server.`);
    const response = await this.modelFetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, provider);
    const text = await response.text();
    if (!response.ok) throw new Error(`${provider} admin agent request failed: ${response.status} ${text}`);
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: unknown }> };
    return parsed.choices?.[0]?.message ?? { content: "" };
  }

  private async chatOpenRouter(body: Record<string, unknown>) {
    const key = this.config.get<string>("OPENROUTER_API_KEY")?.trim();
    if (!key) throw new Error("OpenRouter API key is not configured on the server.");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${key}`
    };
    const referer = this.config.get<string>("OPENROUTER_HTTP_REFERER")?.trim();
    const title = this.config.get<string>("OPENROUTER_APP_NAME")?.trim();
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-Title"] = title;
    const response = await this.modelFetch(this.openRouterBaseUrl, { method: "POST", headers, body: JSON.stringify(body) }, "OpenRouter");
    const text = await response.text();
    if (!response.ok) throw new Error(`OpenRouter admin agent request failed: ${response.status} ${text}`);
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: unknown }> };
    return parsed.choices?.[0]?.message ?? { content: "" };
  }

  private async modelFetch(url: string, options: RequestInit, provider: string) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new ServiceUnavailableException(`${provider} is unavailable. Check the server internet connection and try again.`);
    }
  }
}
