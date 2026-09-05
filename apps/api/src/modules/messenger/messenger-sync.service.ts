import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessengerService } from "./messenger.service";
import { MetaAuthService } from "./meta-auth.service";

@Injectable()
export class MessengerSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessengerSyncService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly messengerService: MessengerService,
    private readonly metaAuthService: MetaAuthService
  ) {}

  onModuleInit() {
    const intervalMinutes = Math.max(5, Number(this.config.get<string>("META_BACKGROUND_SYNC_INTERVAL_MINUTES") ?? 15));
    const initialDelayMs = Math.max(10_000, Number(this.config.get<string>("META_BACKGROUND_SYNC_INITIAL_DELAY_MS") ?? 30_000));
    this.timer = setTimeout(() => {
      void this.run("startup");
      this.timer = setInterval(() => void this.run("scheduled"), intervalMinutes * 60_000);
    }, initialDelayMs);
    this.logger.log(`Messenger background sync enabled: every ${intervalMinutes} minute(s)`);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.timer) clearInterval(this.timer);
  }

  private async run(source: string) {
    if (this.running) return;
    this.running = true;
    try {
      const status = await this.metaAuthService.status();
      if (!status.authenticated) {
        this.logger.warn(`Messenger background health check: Meta authentication is ${status.status}; skipping sync`);
        return;
      }

      const result = await this.messengerService.syncFromMeta({
        maxConversations: Number(this.config.get<string>("META_BACKGROUND_SYNC_MAX_CONVERSATIONS") ?? 100),
        maxMessagesPerConversation: Number(this.config.get<string>("META_BACKGROUND_SYNC_MAX_MESSAGES_PER_CONVERSATION") ?? 1000)
      });
      this.logger.log(`Messenger background sync completed (${source}): conversations=${result.conversationsImported}/${result.conversationsSeen} messages=${result.messagesImported}`);
    } catch (err) {
      this.logger.error(`Messenger background sync failed (${source})`, err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }
}
