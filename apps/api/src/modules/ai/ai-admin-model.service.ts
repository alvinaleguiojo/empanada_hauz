import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiControlService } from "./ai-control.service";

@Injectable()
export class AiAdminModelService {
  private readonly geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  private readonly groqBaseUrl = "https://api.groq.com/openai/v1/chat/completions";
  private readonly openAiBaseUrl = "https://api.openai.com/v1/chat/completions";

  constructor(private readonly config: ConfigService, private readonly aiControl: AiControlService) {}

  async chat(messages: Array<Record<string, unknown>>, tools: Array<Record<string, unknown>>) {
    const settings = await this.aiControl.getGlobalModelSettings();
    const body = { model: settings.model, messages, tools, tool_choice: "auto" };
    if (settings.provider === "gemini") return this.chatProvider(body, this.geminiBaseUrl, "GEMINI_API_KEY", "Gemini");
    if (settings.provider === "groq") return this.chatProvider(body, this.groqBaseUrl, "GROQ_API_KEY", "Groq");
    if (settings.provider === "openai") return this.chatProvider(body, this.openAiBaseUrl, "OPENAI_API_KEY", "OpenAI");
    return this.chatOllama(body);
  }

  private async chatOllama(body: Record<string, unknown>) {
    const baseUrl = (this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
    const timeoutMs = Number(this.config.get<string>("OLLAMA_TIMEOUT_MS", "120000"));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? timeoutMs : 120000);
    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      const text = await response.text();
      if (!response.ok) throw new Error(`Ollama admin agent request failed: ${response.status} ${text}`);
      const parsed = JSON.parse(text) as { choices?: Array<{ message?: unknown }> };
      return parsed.choices?.[0]?.message ?? { content: "" };
    } finally { clearTimeout(timeout); }
  }

  private async chatProvider(body: Record<string, unknown>, url: string, keyName: "GEMINI_API_KEY" | "GROQ_API_KEY" | "OPENAI_API_KEY", provider: string) {
    const key = this.config.get<string>(keyName)?.trim();
    if (!key) throw new Error(`${provider} API key is not configured on the server.`);
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new Error(`${provider} admin agent request failed: ${response.status} ${text}`);
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: unknown }> };
    return parsed.choices?.[0]?.message ?? { content: "" };
  }
}
