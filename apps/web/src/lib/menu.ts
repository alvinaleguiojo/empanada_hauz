export type MenuItem = {
  label: string;
  value: string;
  price: number;
  available?: boolean;
  popular?: boolean;
  isNew?: boolean;
};

type ProductCatalogItem = {
  name: string;
  price: number;
  available: boolean;
  sortOrder?: number;
};

const DEFAULT_MENU_ITEMS: MenuItem[] = [
  { label: "Pork Regular", value: "Pork Regular", price: 20, available: true },
  { label: "Pork with Egg", value: "Pork with Egg", price: 25, available: true, popular: true },
  { label: "Pork Asado", value: "Pork Asado", price: 30, available: true },
  { label: "Chicken", value: "Chicken", price: 20, available: true },
  { label: "Chicken with Egg", value: "Chicken with Egg", price: 25, available: true, popular: true },
  { label: "Ham & Cheese", value: "Ham & Cheese", price: 25, available: true },
  { label: "Beef", value: "Beef", price: 35, available: true, popular: true },
  { label: "Beef with Egg", value: "Beef with Egg", price: 40, available: true },
  { label: "Bacon", value: "Bacon", price: 35, available: true, isNew: true },
  { label: "Ube with Cheese", value: "Ube with Cheese", price: 25, available: true },
  { label: "Choco Flavor", value: "Choco Flavor", price: 30, available: true },
  { label: "Mango Flavor", value: "Mango Flavor", price: 25, available: true }
];

/** Runtime menu cache. Defaults are first-render fallback only. */
export const MENU_ITEMS: MenuItem[] = [...DEFAULT_MENU_ITEMS];

export function replaceMenuItems(products: ProductCatalogItem[]) {
  const metadataByName = new Map(DEFAULT_MENU_ITEMS.map((item) => [item.value.toLowerCase(), item]));
  const next: MenuItem[] = products
    .filter((product) => product.name.trim())
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((product) => {
      const name = product.name.trim();
      const metadata = metadataByName.get(name.toLowerCase());
      const available = product.available !== false;
      return {
        label: available ? name : `${name} — SOLD OUT`,
        value: name,
        price: Number(product.price),
        available,
        ...(metadata?.popular ? { popular: true } : {}),
        ...(metadata?.isNew ? { isNew: true } : {})
      };
    });

  MENU_ITEMS.splice(0, MENU_ITEMS.length, ...next);
}
