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
    deliveryDate?: string;
    address?: string;
    landmark?: string;
    contactNumber?: string;
    paymentMethod?: "cod" | "gcash";
    flavors?: Array<{ name: string; quantity: number; unitPrice?: number; subtotal?: number }>;
    totalAmount?: number;
    confirmed?: boolean;
    missingFields: string[];
  };
  suggestedReply: string;
}
