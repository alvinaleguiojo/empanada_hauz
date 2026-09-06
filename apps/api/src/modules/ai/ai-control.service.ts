import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

type SettingDocument = { key?: string; customerId?: string; enabled?: boolean };
type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };

@Injectable()
export class AiControlService {
  private readonly collection = "ai_automation_settings";
  private readonly globalKey = "global";

  constructor(private readonly prisma: PrismaService) {}

  async getGlobalEnabled() {
    const result = await this.prisma.$runCommandRaw<MongoFindResult<SettingDocument>>({
      find: this.collection,
      filter: { key: this.globalKey },
      limit: 1
    });
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
    const result = await this.prisma.$runCommandRaw<MongoFindResult<SettingDocument>>({
      find: this.collection,
      filter: { customerId },
      limit: 1
    });
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
      effectiveEnabled: globalEnabled && customerOverride !== false
    };
  }

  async getState() {
    return { enabled: await this.getGlobalEnabled() };
  }
}
