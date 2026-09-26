import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export type AiModelProvider = "ollama" | "gemini" | "groq" | "openai" | "openrouter";
type SettingDocument = { key?: string; customerId?: string; enabled?: boolean; provider?: AiModelProvider; model?: string };
type MongoFindResult = { cursor?: { firstBatch?: SettingDocument[] } };

@Injectable()
export class AiControlService {
  private readonly collection = "ai_automation_settings";
  private readonly globalKey = "global";

  constructor(private readonly prisma: PrismaService) {}

  private modelSettingsCache: { expiresAt: number; value: { provider: AiModelProvider; model: string } } | null = null;
  private readonly modelSettingsCacheTtlMs = 5000;

  async getGlobalEnabled() {
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { key: this.globalKey },
      limit: 1
    })) as unknown as MongoFindResult;
    return result.cursor?.firstBatch?.[0]?.enabled !== false;
  }

  async setGlobalEnabled(enabled: boolean) {
    await this.prisma.$runCommandRaw({
      update: this.collection,
      updates: [
        {
          q: { key: this.globalKey },
          u: { $set: { key: this.globalKey, enabled, updatedAt: new Date() } },
          upsert: true
        }
      ]
    });
    return this.getState();
  }

  async getCustomerOverride(customerId: string) {
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { customerId },
      limit: 1
    })) as unknown as MongoFindResult;
    const value = result.cursor?.firstBatch?.[0]?.enabled;
    return typeof value === "boolean" ? value : null;
  }

  async setCustomerOverride(customerId: string, enabled: boolean | null) {
    if (enabled === null) {
      await this.prisma.$runCommandRaw({
        delete: this.collection,
        deletes: [{ q: { customerId }, limit: 1 }]
      });
    } else {
      await this.prisma.$runCommandRaw({
        update: this.collection,
        updates: [
          {
            q: { customerId },
            u: { $set: { customerId, enabled, updatedAt: new Date() } },
            upsert: true
          }
        ]
      });
    }
    return this.getCustomerState(customerId);
  }

  async getCustomerState(customerId: string) {
    const globalEnabled = await this.getGlobalEnabled();
    const customerOverride = await this.getCustomerOverride(customerId);
    return {
      globalEnabled,
      customerOverride,
      effectiveEnabled: customerOverride ?? globalEnabled
    };
  }

  async getGlobalModelSettings(): Promise<{ provider: AiModelProvider; model: string }> {
    if (this.modelSettingsCache && this.modelSettingsCache.expiresAt > Date.now()) return this.modelSettingsCache.value;

    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { key: this.globalKey },
      limit: 1
    })) as unknown as MongoFindResult;
    const setting = result.cursor?.firstBatch?.[0];
    const provider: AiModelProvider = setting?.provider === "gemini" || setting?.provider === "groq" || setting?.provider === "openai" || setting?.provider === "openrouter"
      ? setting.provider
      : "ollama";
    const defaultModel = provider === "gemini"
      ? "gemini-3.8-flash"
      : provider === "groq"
        ? "openai/gpt-oss-20b"
        : provider === "openai"
          ? "gpt-5.6-luna"
          : provider === "openrouter"
            ? "openrouter/free"
            : "qwen3:4b-instruct";
    const savedModel = setting?.model?.trim();
    const model = savedModel || defaultModel;

    // Keep the persisted global setting aligned with the OpenRouter free-tier default.
    if (provider === "openrouter" && !savedModel) {
      await this.prisma.$runCommandRaw({
        update: this.collection,
        updates: [
          {
            q: { key: this.globalKey },
            u: { $set: { key: this.globalKey, provider, model: defaultModel, updatedAt: new Date() } },
            upsert: true
          }
        ]
      });
    }

    const value = { provider, model };
    this.modelSettingsCache = { expiresAt: Date.now() + this.modelSettingsCacheTtlMs, value };
    return value;
  }

  async setGlobalModelSettings(provider: AiModelProvider, model: string) {
    await this.prisma.$runCommandRaw({
      update: this.collection,
      updates: [
        {
          q: { key: this.globalKey },
          u: { $set: { key: this.globalKey, provider, model, updatedAt: new Date() } },
          upsert: true
        }
      ]
    });
    this.modelSettingsCache = null;
    return this.getGlobalModelSettings();
  }

  async getState() {
    return { enabled: await this.getGlobalEnabled() };
  }
}