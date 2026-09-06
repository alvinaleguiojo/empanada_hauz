import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";
import { AiService } from "./ai.service";

type AiContext = { customerName?: string; recentMessages?: string[]; activeOrderState?: { address?: string; landmark?: string; location?: string; deliveryMethod?: string } };

type QuoteResult = {
  distanceKm: number | null;
  estimatedDurationMinutes: number | null;
  estimatedArrivalAt: string | Date | null;
  estimatedFare: number;
};

const PICKUP_ADDRESS = "Empanada Hauz";
const PICKUP_LATITUDE = 10.2760457;
const PICKUP_LONGITUDE = 123.8466921;

@Injectable()
export class AiDeliveryFeeContextService implements OnModuleInit {
  private readonly logger = new Logger(AiDeliveryFeeContextService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly deliveryNetwork: DeliveryNetworkService
  ) {}

  onModuleInit() {
    const original = this.aiService.classifyAndExtract.bind(this.aiService);
    this.aiService.classifyAndExtract = async (message: string, context?: AiContext) => {
      const enrichedContext = await this.enrichDeliveryFeeContext(message, context);
      return original(message, enrichedContext);
    };
  }

  private async enrichDeliveryFeeContext(message: string, context?: AiContext) {
    if (!this.isDeliveryFeeQuestion(message)) return context;

    const state = context?.activeOrderState;
    const dropoffAddress = [state?.address?.trim(), state?.landmark?.trim(), state?.location?.trim()].filter(Boolean).join(", ");
    const recentMessages = [...(context?.recentMessages ?? [])];

    if (!dropoffAddress) {
      recentMessages.push(
        "APPLICATION DELIVERY FEE TOOL RESULT: No destination address is available yet. Ask the customer for their delivery address (and landmark when needed for Maxim) before quoting the delivery fee. Never invent a fee."
      );
      return { ...context, recentMessages };
    }

    try {
      const quote: QuoteResult = await this.deliveryNetwork.quoteJob({
        pickupAddress: PICKUP_ADDRESS,
        pickupLatitude: PICKUP_LATITUDE,
        pickupLongitude: PICKUP_LONGITUDE,
        dropoffAddress
      });

      recentMessages.push(
        `APPLICATION DELIVERY FEE TOOL RESULT: For Maxim delivery from ${PICKUP_ADDRESS} to ${dropoffAddress}, the current calculated delivery fee is ₱${quote.estimatedFare}. Distance: ${quote.distanceKm ?? "unknown"} km. Use this tool result as authoritative for the delivery-fee question. Do not invent or replace it with a generic estimate.`
      );

      this.logger.log(`Delivery fee quote calculated for AI: destination=${JSON.stringify(dropoffAddress)} fee=${quote.estimatedFare}`);
    } catch (error) {
      recentMessages.push(
        "APPLICATION DELIVERY FEE TOOL RESULT: The delivery fee tool could not calculate a quote for the supplied destination. Do not invent a fee; explain that the fee could not be calculated right now and ask for a valid delivery address if needed."
      );
      this.logger.warn(`Delivery fee quote failed for AI: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { ...context, recentMessages };
  }

  private isDeliveryFeeQuestion(message: string) {
    return /\b(delivery\s*fee|delivery\s*charge|shipping\s*fee|df|how much (?:is )?(?:the )?delivery|pila (?:ang )?(?:delivery|df)|tagpila (?:ang )?(?:delivery|df))\b/i.test(message);
  }
}
