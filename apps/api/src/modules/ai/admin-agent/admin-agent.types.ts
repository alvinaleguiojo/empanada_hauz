export type AdminIntent = "confirmation" | "order_lookup" | "customer_lookup" | "metrics" | "product_lookup" | "smalltalk" | "complex";

export interface AdminRoute {
  intent: AdminIntent;
  query?: string;
  toolNames?: string[];
  reply?: string;
}
