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

type CachedQuote = { expiresAt: number; quote: QuoteResult };

const PICKUP_ADDRESS = "Empanada Hauz, Cabancalan 2, Bulacao, Cebu City";
const PICKUP_LATITUDE = 10.2760457;
const PICKUP_LONGITUDE = 123.8466921;
const QUOTE_CACHE_TTL_MS = 60_000;
const MAX_QUOTE_CACHE_ENTRIES = 50;

@Injectable()
export class AiDeliveryFeeContextService implements OnModuleInit {
  private readonly logger = new Logger(AiDeliveryFeeContextService.name);
  private readonly quoteCache = new Map<string, CachedQuote>();

  constructor(private readonly aiService: AiService, private readonly deliveryNetwork: DeliveryNetworkService, private readonly maps: MapsService) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);
    this.aiService.classifyAndExtract = async (message, context) => {
      const enriched = await this.enrichDeliveryFeeContext(message, context);
      const result = await original(message, enriched.context);
      if (enriched.estimatedFare !== undefined && this.isDeliveryFeeQuestion(message, context?.recentMessages)) {
        const feeLine = `Delivery fee to your location is ₱${enriched.estimatedFare}.`;
        const reply = result.suggestedReply?.trim() ?? "";
        const normalizedFee = `₱${enriched.estimatedFare}`;
        result.suggestedReply = reply && reply.includes(normalizedFee) ? reply : reply ? `${reply}\n${feeLine}` : feeLine;
      }
      return result;
    };
  }

  private async enrichDeliveryFeeContext(message: string, context?: AiContext) {
    const recentMessages = [...(context?.recentMessages ?? [])];
    const hasPendingLocationOptions = recentMessages.some((entry) => entry.startsWith("APPLICATION DELIVERY LOCATION OPTIONS:"));
    const isLocationSelection = hasPendingLocationOptions && /^(?:[1-5]|one|two|three|four|five)\.?$/i.test(message.trim());
    const isDeliveryFeeQuestion = this.isDeliveryFeeQuestion(message, recentMessages);
    const isDeliveryFeeFollowUp = this.isDeliveryFeeLocationFollowUp(message, recentMessages);
    if (!isDeliveryFeeQuestion && !isLocationSelection && !isDeliveryFeeFollowUp) return { context, estimatedFare: undefined };

    let activeOrderState = context?.activeOrderState;
    const requestedLocation = this.extractRequestedDeliveryLocation(message, isDeliveryFeeFollowUp);
    const previousLocation = !requestedLocation && !isLocationSelection ? this.extractRecentDeliveryLocation(recentMessages) : undefined;
    const savedLocation = this.nonPickupLocation(activeOrderState?.address) ?? this.nonPickupLocation(activeOrderState?.location);
    const effectiveLocation = requestedLocation ?? previousLocation ?? savedLocation;

    if (isLocationSelection) {
      const selected = this.resolveLocationSelection(message, recentMessages);
      if (selected) {
        activeOrderState = { ...activeOrderState, flavors: [...(activeOrderState?.flavors ?? [])], missingFields: [...(activeOrderState?.missingFields ?? [])], confirmed: activeOrderState?.confirmed ?? false, address: selected.formattedAddress, location: selected.formattedAddress };
        recentMessages.push(`APPLICATION VERIFIED DELIVERY LOCATION: ${selected.formattedAddress} (${selected.latitude}, ${selected.longitude}). This location was selected by the customer from Google Maps results. Use it as the destination; do not ask the customer to repeat the address.`);
      } else {
        recentMessages.push("APPLICATION DELIVERY LOCATION RESULT: The selected location number was invalid. Ask the customer to choose one of the listed location numbers.");
        return { context: { ...context, recentMessages }, estimatedFare: undefined };
      }
    } else if (effectiveLocation) {
      activeOrderState = { ...activeOrderState, flavors: [...(activeOrderState?.flavors ?? [])], missingFields: [...(activeOrderState?.missingFields ?? [])], confirmed: activeOrderState?.confirmed ?? false, address: effectiveLocation, location: effectiveLocation };
      if (previousLocation) recentMessages.push(`APPLICATION REMEMBERED DELIVERY LOCATION: ${previousLocation}. Use this previously provided customer destination for the current delivery-fee question unless the customer supplies a new location.`);
    }

    const state = activeOrderState;
    if (!effectiveLocation && !isLocationSelection && (this.isCoordinateOnly(state?.address) || this.isCoordinateOnly(state?.location))) {
      recentMessages.push("APPLICATION DELIVERY FEE TOOL RESULT: The saved delivery location is invalid and is not a verified customer address. Ask the customer for their delivery location before calculating a fee. Never invent a fee.");
      const sanitizedState = state ? { ...state, address: undefined, location: undefined } : state;
      return { context: { ...context, activeOrderState: sanitizedState, recentMessages }, estimatedFare: undefined };
    }

    const dropoffAddress = [state?.address?.trim(), state?.landmark?.trim(), state?.location?.trim()].filter(Boolean).join(", ");
    if (!dropoffAddress || this.isUnresolvedAddress(dropoffAddress) || this.isPickupAddress(dropoffAddress)) {
      recentMessages.push("APPLICATION DELIVERY FEE TOOL RESULT: No verified customer destination is available. The Empanada Hauz pickup address must never be used as the delivery destination. Ask the customer for their delivery location before quoting.");
      return { context: { ...context, activeOrderState: state ? { ...state, address: effectiveLocation, location: effectiveLocation } : state, recentMessages }, estimatedFare: undefined };
    }

    const cacheKey = this.normalizeCacheKey(dropoffAddress);
    const cached = this.quoteCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return this.withQuoteContext({ ...context, activeOrderState: state }, recentMessages, dropoffAddress, cached.quote);
    if (cached) this.quoteCache.delete(cacheKey);

    try {
      const candidates = await this.maps.findLocationCandidates(dropoffAddress, 5);
      if (candidates.length === 0) {
        recentMessages.push(`APPLICATION DELIVERY FEE TOOL RESULT: Google Maps could not verify "${dropoffAddress}". Do not calculate a delivery fee. Ask the customer for a more specific delivery location.`);
        return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
      }
      if (candidates.length > 1 && !isLocationSelection) {
        recentMessages.push(this.formatLocationOptions(candidates));
        recentMessages.push("APPLICATION DELIVERY FEE TOOL RESULT: Multiple Google Maps locations matched the supplied destination. Do not calculate a delivery fee yet. Ask the customer to choose one numbered location.");
        return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
      }
      const selectedCandidate = candidates[0];
      const quote = await this.deliveryNetwork.quoteJob({ pickupAddress: PICKUP_ADDRESS, pickupLatitude: PICKUP_LATITUDE, pickupLongitude: PICKUP_LONGITUDE, dropoffAddress: selectedCandidate.formattedAddress, dropoffLatitude: selectedCandidate.latitude, dropoffLongitude: selectedCandidate.longitude });
      if (!Number.isFinite(quote.estimatedFare) || quote.estimatedFare <= 0 || quote.distanceKm == null) {
        recentMessages.push(`APPLICATION DELIVERY FEE TOOL RESULT: Google Maps could not produce a valid road route for ${dropoffAddress}. Do not invent a fee. Ask the customer to select a more specific/verified location.`);
        return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
      }
      this.quoteCache.set(cacheKey, { expiresAt: Date.now() + QUOTE_CACHE_TTL_MS, quote });
      this.trimQuoteCache();
      this.logger.log(`Delivery fee quote calculated for AI: destination=${JSON.stringify(dropoffAddress)} fee=${quote.estimatedFare}`);
      return this.withQuoteContext({ ...context, activeOrderState: state }, recentMessages, dropoffAddress, quote);
    } catch (error) {
      recentMessages.push("APPLICATION DELIVERY FEE TOOL RESULT: The delivery fee tool could not calculate a quote for the supplied destination. Do not invent a fee; ask for a valid delivery location.");
      this.logger.warn(`Delivery fee quote failed for AI: ${error instanceof Error ? error.message : String(error)}`);
      return { context: { ...context, activeOrderState: state, recentMessages }, estimatedFare: undefined };
    }
  }

  private extractRequestedDeliveryLocation(message: string, isFollowUp = false) {
    if (isFollowUp) {
      if (this.isDeliveryFeeQuestion(message)) return undefined;
      const followUpLocation = message.replace(/[.!,;?]+$/g, "").replace(/\s+/g, " ").trim();
      return followUpLocation && !/^(?:my area|your area|there|here)$/i.test(followUpLocation) ? followUpLocation : undefined;
    }
    const match = message.match(/(?:delivery\s*(?:fee|charge)|shipping\s*fee|\bdf\b)\s+(?:in|at|to|for|sa|is)\s+(.+?)(?:\?|$)/i);
    if (!match?.[1]) return undefined;
    const location = match[1].replace(/[.!,;]+$/g, "").replace(/\s+/g, " ").trim();
    return location && !/^(?:my area|your area|there|here)$/i.test(location) ? location : undefined;
  }

  private extractRecentDeliveryLocation(recentMessages: string[]) {
    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
      const entry = recentMessages[index].replace(/\s+/g, " ").trim();
      if (!entry || /^APPLICATION /i.test(entry) || !/\bdelivery\b/i.test(entry)) continue;
      const match = entry.match(/\bdelivery\s+(?:in|at|to|for)\s+([^?.!]+?)(?:[?.!]|$)/i)
        ?? entry.match(/\b(?:arrange|request|want|need|can\s+i|how\s+can\s+i)[^.?!]{0,60}\bdelivery\b\s+(?:in|at|to|for)\s+([^?.!]+?)(?:[?.!]|$)/i)
        ?? entry.match(/\bdeliver(?:y)?\s+(?:in|at|to|for)\s+([^?.!]+?)(?:[?.!]|$)/i);
      if (!match?.[1]) continue;
      const location = match[1].replace(/\s+/g, " ").trim();
      if (location && !/^(?:my area|your area|there|here)$/i.test(location) && !this.isPickupAddress(location)) return location;
    }
    return undefined;
  }

  private nonPickupLocation(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed && !this.isPickupAddress(trimmed) && !this.isCoordinateOnly(trimmed) ? trimmed : undefined;
  }

  private isPickupAddress(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
    const pickup = PICKUP_ADDRESS.toLowerCase().replace(/\s+/g, " ").trim();
    return normalized === pickup || normalized.includes("empanada hauz") && normalized.includes("cabancalan 2") && normalized.includes("bulacao");
  }

  private isDeliveryFeeLocationFollowUp(message: string, recentMessages: string[]) {
    const location = message.trim();
    if (!location || location.length > 120) return false;
    if (/^(?:yes|no|okay|ok|sure|thanks|thank you|there|here|my area|your area)$/i.test(location)) return false;
    const askedForDeliveryLocation = recentMessages.some((entry) => /(?:provide|send|give|share|what(?:'s| is|s)?)\b.{0,80}\b(?:delivery\s+)?(?:address|location|area)\b/i.test(entry) || /\bdelivery\s+fee\b.{0,100}\b(?:check|quote|calculate)\b/i.test(entry));
    return askedForDeliveryLocation && !/\b(?:price|menu|order|bacon|chicken|pork|beef|ube|mango|choco|ham|cheese|gcash|cod|pickup)\b/i.test(location);
  }

  private formatLocationOptions(candidates: LocationCandidate[]) {
    return `APPLICATION DELIVERY LOCATION OPTIONS: ${JSON.stringify(candidates.map((candidate, index) => ({ index: index + 1, formattedAddress: candidate.formattedAddress, latitude: candidate.latitude, longitude: candidate.longitude })))}`;
  }

  private resolveLocationSelection(message: string, recentMessages: string[]): LocationCandidate | null {
    const optionsEntry = [...recentMessages].reverse().find((entry) => entry.startsWith("APPLICATION DELIVERY LOCATION OPTIONS:"));
    if (!optionsEntry) return null;
    try {
      const options = JSON.parse(optionsEntry.slice("APPLICATION DELIVERY LOCATION OPTIONS:".length).trim()) as Array<LocationCandidate & { index: number }>;
      const normalized = message.trim().toLowerCase().replace(/\.$/, "");
      const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
      const index = words[normalized] ?? Number(normalized);
      return Number.isInteger(index) && index > 0 ? options.find((option) => option.index === index) ?? null : null;
    } catch { return null; }
  }

  private isCoordinateOnly(value?: string | null) { return !!value?.trim() && /^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(value.trim()); }
  private isUnresolvedAddress(value: string) { const normalized = value.toLowerCase().trim(); return !normalized || /^(none|null|undefined|n\/a)(\s*,\s*(none|null|undefined|n\/a))*$/i.test(normalized) || normalized.includes("none, none"); }

  private withQuoteContext(context: AiContext | undefined, recentMessages: string[], dropoffAddress: string, quote: QuoteResult) {
    recentMessages.push(`APPLICATION DELIVERY FEE TOOL RESULT: For Maxim delivery from ${PICKUP_ADDRESS} to ${dropoffAddress}, the current calculated delivery fee is ₱${quote.estimatedFare}. Distance: ${quote.distanceKm ?? "unknown"} km. Use this tool result as authoritative for the delivery-fee question. The final customer reply MUST state the calculated delivery fee. Do not invent or replace it with a generic estimate.`);
    return { context: { ...context, recentMessages }, estimatedFare: quote.estimatedFare };
  }

  private trimQuoteCache() { if (this.quoteCache.size <= MAX_QUOTE_CACHE_ENTRIES) return; const firstKey = this.quoteCache.keys().next().value; if (firstKey) this.quoteCache.delete(firstKey); }
  private normalizeCacheKey(value: string) { return value.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim(); }
  private isDeliveryFeeQuestion(message: string, recentMessages: string[] = []) { return /\b(delivery\s*fee|delivery\s*charge|shipping\s*fee|df|how much (?:is )?(?:the )?delivery)\b/i.test(message) || this.isDeliveryFeeLocationFollowUp(message, recentMessages); }
}
