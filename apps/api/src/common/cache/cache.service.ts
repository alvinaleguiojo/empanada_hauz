import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

interface MemoryEntry {
  expiresAt: number;
  value: string;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix = "eh:cache:";
  private readonly versionKey = "eh:cache:version";
  private readonly ttlSeconds = Math.max(1, Number(process.env.CACHE_TTL_SECONDS ?? 30));
  private readonly redis?: Redis;
  private readonly memory = new Map<string, MemoryEntry>();
  private version = "1";

  constructor() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      });
      this.redis.on("error", (error) => {
        this.logger.warn(`Redis cache unavailable: ${error.message}`);
      });
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const cacheKey = await this.buildKey(key);

    if (this.redis) {
      try {
        const raw = await this.redis.get(cacheKey);
        if (raw) return JSON.parse(raw) as T;
      } catch (error) {
        this.logger.debug(`Cache read fallback: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const entry = this.memory.get(cacheKey);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(cacheKey);
      return undefined;
    }

    try {
      return JSON.parse(entry.value) as T;
    } catch {
      this.memory.delete(cacheKey);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = this.ttlSeconds): Promise<void> {
    const cacheKey = await this.buildKey(key);
    const serialized = JSON.stringify(value);
    const ttl = Math.max(1, ttlSeconds);

    if (this.redis) {
      try {
        await this.redis.set(cacheKey, serialized, "EX", ttl);
        return;
      } catch (error) {
        this.logger.debug(`Cache write fallback: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.memory.set(cacheKey, {
      value: serialized,
      expiresAt: Date.now() + ttl * 1000
    });
  }

  async invalidateAll(): Promise<void> {
    this.memory.clear();

    if (!this.redis) {
      this.version = String(Number(this.version) + 1);
      return;
    }

    try {
      await this.redis.incr(this.versionKey);
      return;
    } catch (error) {
      this.version = String(Number(this.version) + 1);
      this.logger.debug(`Cache invalidation fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memory.delete(await this.buildKey(key));
    await this.invalidateAll();
  }

  getTtlSeconds(): number {
    return this.ttlSeconds;
  }

  private async buildKey(key: string): Promise<string> {
    let version = this.version;

    if (this.redis) {
      try {
        if (this.redis.status === "wait") await this.redis.connect();
        version = (await this.redis.get(this.versionKey)) ?? "1";
      } catch (error) {
        this.logger.debug(`Cache version fallback: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return `${this.prefix}v${version}:${key}`;
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}
