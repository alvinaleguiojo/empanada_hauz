import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

interface MemoryBucket {
  count: number;
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly prefix = process.env.RATE_LIMIT_PREFIX?.trim() || "eh:rate:v1";
  private readonly redis?: Redis;
  private readonly memory = new Map<string, MemoryBucket>();
  private redisWarningLogged = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL?.trim();

    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000
      });

      this.redis.on("error", (error) => {
        if (!this.redisWarningLogged) {
          this.redisWarningLogged = true;
          this.logger.warn(`Redis rate limiter unavailable; using process-local fallback: ${error.message}`);
        }
      });
    } else {
      this.logger.warn("REDIS_URL is not configured; rate limiting will use a process-local fallback.");
    }
  }

  async consume(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const safeWindow = Math.max(1, Math.floor(windowSeconds));
    const now = Date.now();
    const windowMs = safeWindow * 1000;
    const resetAt = now + windowMs;

    if (this.redis) {
      try {
        if (this.redis.status === "wait") await this.redis.connect();

        const redisKey = `${this.prefix}:${key}`;
        const result = (await this.redis.eval(
          `local current = redis.call("INCR", KEYS[1])
if current == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}`,
          1,
          redisKey,
          safeWindow
        )) as [number, number];

        const count = Number(result?.[0] ?? 0);
        const ttl = Math.max(1, Number(result?.[1] ?? safeWindow));
        const allowed = count <= safeLimit;

        return {
          allowed,
          limit: safeLimit,
          remaining: Math.max(0, safeLimit - count),
          resetAt: now + ttl * 1000,
          retryAfterSeconds: allowed ? 0 : ttl
        };
      } catch (error) {
        this.logger.debug(
          `Redis rate limit fallback: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return this.consumeMemory(key, safeLimit, windowMs);
  }

  private consumeMemory(
    key: string,
    limit: number,
    windowMs: number
  ): RateLimitResult {
    const now = Date.now();
    const current = this.memory.get(key);

    if (!current || current.expiresAt <= now) {
      const expiresAt = now + windowMs;
      this.memory.set(key, { count: 1, expiresAt });

      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt: expiresAt,
        retryAfterSeconds: 0
      };
    }

    current.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));

    return {
      allowed: current.count <= limit,
      limit,
      remaining: Math.max(0, limit - current.count),
      resetAt: current.expiresAt,
      retryAfterSeconds: current.count <= limit ? 0 : retryAfterSeconds
    };
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
    this.memory.clear();
  }
}
