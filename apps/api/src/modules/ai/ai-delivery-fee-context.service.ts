import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";
import { AiService } from "./ai.service";

type AiContext = Parameters<AiService["classifyAndExtract"]>[1];

type QuoteResult = {
  distanceKm: number | null;
  estimatedDurationMinutes: number | null;
  estimatedArrivalAt: string | Date | null;
  estimatedFare: number;
};

type CachedQuote = {
  expiresAt: number;
  quote: QuoteResult;
};

const PICKUP_ADDRESS = "Empanada Hauz";
const PICKUP_LATITUDE = 10.2760457;
const PICKUP_LONGITUDE = 123.8466921;
const QUOTE_CACHE_TTL_MS = 60_000;
const MAX_QUOTE_CACHE_ENTRIES = 50;

@Injectable()
export class AiDeliveryFeeContextService implements OnModuleInit {
  private readonly logger = new Logger(AiDeliveryFeeContextService.name);
  private readonly quoteCache = new Map<string, CachedQuote>();

  constructor(
    private readonly aiService: AiService,
    private readonly deliveryNetwork: DeliveryNetworkService
  ) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);
    this.aiService.classifyAndExtract = async (message, context) => {
      const enriched = await this.enrichDeliveryFeeContext(message, context);
      const result = await original(message, enriched.context);

      if (enriched.estimatedFare !== undefined && this.isDeliveryFeeQuestion(message)) {
        const feeLine = `Delivery fee to your location is ₱${enriched.estimatedFare}.`;
        const reply = result.suggestedReply?.trim() ?? "";
        result.suggestedReply = reply ? `${reply}\n${feeLine}` : feeLine;
      }

      return result;
    };
  }

  private async enrichDeliveryFeeContext(message: string, context?: AiContext) {
    if (!this.isDeliveryFeeQuestion(message)) return { context, estimatedFare: undefined };

    const state = context?.activeOrderState;
    const dropoffAddress = [state?.address?.trim(), state?.landmark?.trim(), state?.location?.trim()].filter(Boolean).join(", ");
    const recentMessages = [...(context?.recentMessages ?? [])];

    if (!dropoffAddress) {
      recentMessages.push(
        "APPLICATION DELIVERY FEE TOOL RESULT: No destination address is available yet. Ask the customer for their delivery address (and landmark when needed for Maxim) before quoting the delivery fee. Never invent a fee."
      );
      return { context: { ...context, recentMessages }, estimatedFare: undefined };
    }

    const cacheKey = this.normalizeCacheKey(dropoffAddress);
    const cached = this.quoteCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Using cached delivery fee quote for destination=${JSON.stringify(dropoffAddress)} fee=${cached.quote.estimatedFare}`);
      return this.withQuoteContext(context, recentMessages, dropoffAddress, cached.quote);
    }
    if (cached) this.quoteCache.delete(cacheKey);

    try {
      const quote: QuoteResult = await this.deliveryNetwork.quoteJob({
        pickupAddress: PICKUP_ADDRESS,
        pickupLatitude: PICKUP_LATITUDE,
        pickupLongitude: PICKUP_LONGITUDE,
        dropoffAddress
      });

      if (!Number.isFinite(quote.estimatedFare) || quote.estimatedFare <= 0) {
        recentMessages.push(
          `APPLICATION DELIVERY FEE TOOL RESULT: The tool could not calculate a valid delivery fee for ${dropoffAddress}. Do not invent a fee; explain that the fee could not be calculated right now and ask for a more complete address if needed.`
        );
        return { context: { ...context, recentMessages }, estimatedFare: undefined };
      }

      this.quoteCache.set(cacheKey, { expiresAt: Date.now() + QUOTE_CACHE_TTL_MS, quote });
      this.trimQuoteCache();
      this.logger.log(`Delivery fee quote calculated for AI: destination=${JSON.stringify(dropoffAddress)} fee=${quote.estimatedFare}`);
      return this.withQuoteContext(context, recentMessages, dropoffAddress, quote);
    } catch (error) {
      recentMessages.push(
        "APPLICATION DELIVERY FEE TOOL RESULT: The delivery fee tool could not calculate a quote for the supplied destination. Do not invent a fee; explain that the fee could not be calculated right now and ask for a valid delivery address if needed."
      );
      this.logger.warn(`Delivery fee quote failed for AI: ${error instanceof Error ? error.message : String(error)}`);
      return { context: { ...context, recentMessages }, estimatedFare: undefined };
    }
  }

  private withQuoteContext(context: AiContext | undefined, recentMessages: string[], dropoffAddress: string, quote: QuoteResult) {
    recentMessages.push(
      `APPLICATION DELIVERY FEE TOOL RESULT: For Maxim delivery from ${PICKUP_ADDRESS} to ${dropoffAddress}, the current calculated delivery fee is ₱${quote.estimatedFare}. Distance: ${quote.distanceKm ?? "unknown"} km. Use this tool result as authoritative for the delivery-fee question. The final customer reply MUST state the calculated delivery fee. Do not invent or replace it with a generic estimate.`
    );
    return { context: { ...context, recentMessages }, estimatedFare: quote.estimatedFare };
  }

  private trimQuoteCache() {
    if (this.quoteCache.size <= MAX_QUOTE_CACHE_ENTRIES) return;
    const firstKey = this.quoteCache.keys().next().value;
    if (firstKey) this.quoteCache.delete(firstKey);
  }

  private normalizeCacheKey(value: string) {
    return value.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
  }

  private isDeliveryFeeQuestion(message: string) {
    return /\b(delivery\s*fee|delivery\s*charge|shipping\s*fee|df|how much (?:is )?(?:the )?delivery|pila (?:ang )?(?:delivery|df)|tagpila (?:ang )?(?:delivery|df))\b/i.test(message);
  }
}
