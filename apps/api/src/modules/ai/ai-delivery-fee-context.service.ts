import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";
import { MapsService, LocationCandidate } from "../delivery-network/maps.service";
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

const PICKUP_ADDRESS = "Empanada Hauz, Cabancalan 2, Bulacao, Cebu City";
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
    private readonly deliveryNetwork: DeliveryNetworkService,
    private readonly maps: MapsService
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
    const recentMessages = [...(context?.recentMessages ?? [])];
    const hasPendingLocationOptions = recentMessages.some((entry) => entry.startsWith("APPLICATION DELIVERY LOCATION OPTIONS:"));
    const isLocationSelection = hasPendingLocationOptions && /^(?:[1-5]|one|two|three|four|five)\.?$/i.test(message.trim());

    if (!this.isDeliveryFeeQuestion(message) && !isLocationSelection) return { context, estimatedFare: undefined };

    let activeOrderState = context?.activeOrderState;
    if (isLocationSelection) {
      const selected = this.resolveLocationSelection(message, recentMessages);
      if (selected) {
        activeOrderState = {
          ...activeOrderState,
          flavors: [...(activeOrderState?.flavors ?? [])],
          missingFields: [...(activeOrderState?.missingFields ?? [])],
          confirmed: activeOrderState?.confirmed ?? false,
          address: selected.formattedAddress,
          location: selected.formattedAddress
        };
        recentMessages.push(
          `APPLICATION VERIFIED DELIVERY LOCATION: ${selected.formattedAddress} (${selected.latitude}, ${selected.longitude}). This location was selected by the customer from Google Maps results. Use it as the destination; do not ask the customer to repeat the address.`
        );
      } else {
        recentMessages.push("APPLICATION DELIVERY LOCATION RESULT: The selected location number was invalid. Ask the customer to choose one of the listed location numbers.");
        return { context: { ...context, recentMessages }, estimatedFare: undefined };
      }
    }

    const state = activeOrderState;
    const dropoffAddress = [state?.address?.trim(), state?.landmark?.trim(), state?.location?.trim()].filter(Boolean).join(", ");

    if (!dropoffAddress || this.isUnresolvedAddress(dropoffAddress)) {
      recentMessages.push(
        "APPLICATION DELIVERY FEE TOOL RESULT: No verified destination address is available yet. Ask the customer for their delivery address and, when needed, show location choices before quoting. Never invent a fee."
      );
      return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
    }

    const cacheKey = this.normalizeCacheKey(dropoffAddress);
    const cached = this.quoteCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Using cached delivery fee quote for destination=${JSON.stringify(dropoffAddress)} fee=${cached.quote.estimatedFare}`);
      return this.withQuoteContext({ ...context, activeOrderState: state }, recentMessages, dropoffAddress, cached.quote);
    }
    if (cached) this.quoteCache.delete(cacheKey);

    try {
      const candidates = await this.maps.findLocationCandidates(dropoffAddress, 5);
      if (candidates.length > 1 && !isLocationSelection) {
        recentMessages.push(this.formatLocationOptions(candidates));
        recentMessages.push("APPLICATION DELIVERY FEE TOOL RESULT: Multiple Google Maps locations matched the supplied destination. Do not calculate a delivery fee yet. Ask the customer to choose one numbered location.");
        return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
      }

      const selectedCandidate = candidates[0];
      const quote: QuoteResult = await this.deliveryNetwork.quoteJob({
        pickupAddress: PICKUP_ADDRESS,
        pickupLatitude: PICKUP_LATITUDE,
        pickupLongitude: PICKUP_LONGITUDE,
        dropoffAddress: selectedCandidate?.formattedAddress ?? dropoffAddress,
        dropoffLatitude: selectedCandidate?.latitude,
        dropoffLongitude: selectedCandidate?.longitude
      });

      if (!Number.isFinite(quote.estimatedFare) || quote.estimatedFare <= 0 || quote.distanceKm == null) {
        recentMessages.push(
          `APPLICATION DELIVERY FEE TOOL RESULT: Google Maps could not produce a valid road route for ${dropoffAddress}. Do not invent a fee. Ask the customer to select a more specific/verified location.`
        );
        return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
      }

      this.quoteCache.set(cacheKey, { expiresAt: Date.now() + QUOTE_CACHE_TTL_MS, quote });
      this.trimQuoteCache();
      this.logger.log(`Delivery fee quote calculated for AI: destination=${JSON.stringify(dropoffAddress)} fee=${quote.estimatedFare}`);
      return this.withQuoteContext({ ...context, activeOrderState: state }, recentMessages, dropoffAddress, quote);
    } catch (error) {
      recentMessages.push(
        "APPLICATION DELIVERY FEE TOOL RESULT: The delivery fee tool could not calculate a quote for the supplied destination. Do not invent a fee; ask for a valid delivery location."
      );
      this.logger.warn(`Delivery fee quote failed for AI: ${error instanceof Error ? error.message : String(error)}`);
      return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
    }
  }

  private formatLocationOptions(candidates: LocationCandidate[]) {
    const options = candidates.map((candidate, index) => ({
      index: index + 1,
      formattedAddress: candidate.formattedAddress,
      latitude: candidate.latitude,
      longitude: candidate.longitude
    }));
    return `APPLICATION DELIVERY LOCATION OPTIONS: ${JSON.stringify(options)}`;
  }

  private resolveLocationSelection(message: string, recentMessages: string[]): LocationCandidate | null {
    const optionsEntry = [...recentMessages].reverse().find((entry) => entry.startsWith("APPLICATION DELIVERY LOCATION OPTIONS:"));
    if (!optionsEntry) return null;

    try {
      const raw = optionsEntry.slice("APPLICATION DELIVERY LOCATION OPTIONS:".length).trim();
      const options = JSON.parse(raw) as Array<LocationCandidate & { index: number }>;
      const normalized = message.trim().toLowerCase().replace(/\.$/, "");
      const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
      const index = words[normalized] ?? Number(normalized);
      if (!Number.isInteger(index) || index < 1) return null;
      return options.find((option) => option.index === index) ?? null;
    } catch {
      return null;
    }
  }

  private isUnresolvedAddress(value: string) {
    const normalized = value.toLowerCase().trim();
    return !normalized || /^(none|null|undefined|n\/a)(\s*,\s*(none|null|undefined|n\/a))*$/i.test(normalized) || normalized.includes("none, none");
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
