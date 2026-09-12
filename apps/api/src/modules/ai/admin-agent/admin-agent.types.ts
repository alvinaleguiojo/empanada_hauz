export type AdminIntent = "confirmation" | "order_lookup" | "customer_lookup" | "metrics" | "product_lookup" | "product_price" | "datetime" | "smalltalk" | "complex";

export interface AdminRoute {
  intent: AdminIntent;
  query?: string;
  toolNames?: string[];
  reply?: string;
}
