import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_METADATA_KEY = "rate_limit";

export type RateLimitKey = "ip" | "user" | "user_or_ip";

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
  key?: RateLimitKey;
  skip?: boolean;
}

export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, config);

export const SkipRateLimit = () =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, { skip: true });
