export type AdminIntent = "confirmation" | "order_lookup" | "customer_lookup" | "metrics" | "complex";

export interface AdminRoute {
  intent: AdminIntent;
  query?: string;
  toolNames?: string[];
}
