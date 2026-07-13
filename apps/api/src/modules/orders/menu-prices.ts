/**
 * Authoritative flavor price list. This is the single source of truth for
 * pricing on the server — client-submitted `price`/`subtotal` values for
 * order line items are NEVER trusted directly. Keep this in sync with the
 * flavor list shown on the customer ordering page
 * (apps/web/src/app/customer/page.tsx).
 */
export const MENU_PRICES: Record<string, number> = {
  "Pork Regular": 20,
  "Pork with Egg": 25,
  "Chicken": 20,
  "Chicken with Egg": 25,
  "Ham & Cheese": 25,
  "Beef": 35,
  "Beef with Egg": 40,
  "Ube with Cheese": 25,
  "Choco Flavor": 30,
  "Mango Flavor": 25
};

export function priceForFlavor(name: string): number | undefined {
  return MENU_PRICES[name];
}
