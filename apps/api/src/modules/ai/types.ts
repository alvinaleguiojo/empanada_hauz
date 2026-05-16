export type DeliveryMethodValue = "pickup" | "maxim";

export type CustomerIntent =
  | "inquiry"
  | "order_confirmation"
  | "reservation"
  | "delivery_request"
  | "pickup_request"
  | "pricing_question";

export interface AIIntentResult {
  intent: CustomerIntent;
  confidence: number;
  details: {
    quantity?: number;
    location?: string;
    deliveryMethod?: DeliveryMethodValue;
    preferredTime?: string;
    missingFields: string[];
  };
  suggestedReply: string;
}
