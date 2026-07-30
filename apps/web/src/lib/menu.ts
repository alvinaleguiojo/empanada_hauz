export type MenuItem = {
  label: string;
  value: string;
  price: number;
  popular?: boolean;
  isNew?: boolean;
};

/**
 * Single source of truth for flavors and prices across the web app —
 * the customer ordering page, the staff manual order form, and the
 * staff order-edit form all read from this one list.
 *
 * To add a new flavor: add one line here. Don't duplicate this list
 * elsewhere.
 *
 * IMPORTANT: the backend (apps/api/src/modules/orders/menu-prices.ts)
 * keeps its own copy for server-side price validation on public orders,
 * since it's a separate deployable app. When you add a flavor here,
 * add it there too.
 */
export const MENU_ITEMS: MenuItem[] = [
  { label: "Pork Regular", value: "Pork Regular", price: 20 },
  { label: "Pork with Egg", value: "Pork with Egg", price: 25, popular: true },
  { label: "Pork Asado", value: "Pork Asado", price: 30 },
  { label: "Chicken", value: "Chicken", price: 20 },
  { label: "Chicken with Egg", value: "Chicken with Egg", price: 25, popular: true },
  { label: "Ham & Cheese", value: "Ham & Cheese", price: 25 },
  { label: "Beef", value: "Beef", price: 35, popular: true },
  { label: "Beef with Egg", value: "Beef with Egg", price: 40 },
  { label: "Bacon", value: "Bacon", price: 35, isNew: true },
  { label: "Ube with Cheese", value: "Ube with Cheese", price: 25 },
  { label: "Choco Flavor", value: "Choco Flavor", price: 30 },
  { label: "Mango Flavor", value: "Mango Flavor", price: 25 }
];
