export type DeliveryMethod = "pickup" | "maxim";
export type CustomerIntent =
  | "inquiry"
  | "order_confirmation"
  | "reservation"
  | "delivery_request"
  | "pickup_request"
  | "pricing_question";

export type OrderStatus =
  | "inquiry"
  | "awaiting_confirmation"
  | "confirmed"
  | "queued"
  | "preparing"
  | "frying"
  | "packed"
  | "ready_for_pickup"
  | "ready_for_booking"
  | "booked"
  | "completed"
  | "cancelled";

export type BatchName = "Morning Batch" | "Afternoon Batch";

export interface ExtractedOrderDetails {
  quantity?: number;
  location?: string;
  deliveryMethod?: DeliveryMethod;
  preferredTime?: string;
  missingFields: string[];
}

export interface AIIntentResult {
  intent: CustomerIntent;
  confidence: number;
  details: ExtractedOrderDetails;
  suggestedReply: string;
}
