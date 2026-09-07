export type MenuItem = {
  label: string;
  value: string;
  price: number;
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

/**
 * Runtime menu cache used by the customer ordering form and staff order forms.
 * Defaults are only the first-render fallback; the Product API replaces this
 * list at runtime so Admin Product changes propagate without code edits.
 */
export const MENU_ITEMS: MenuItem[] = [...DEFAULT_MENU_ITEMS];

export function replaceMenuItems(products: ProductCatalogItem[]) {
  const metadataByName = new Map(DEFAULT_MENU_ITEMS.map((item) => [item.value.toLowerCase(), item]));
  const next = products
    .filter((product) => product.available)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((product) => {
      const name = product.name.trim();
      const metadata = metadataByName.get(name.toLowerCase());
      return {
        label: name,
        value: name,
        price: Number(product.price),
        ...(metadata?.popular ? { popular: true } : {}),
        ...(metadata?.isNew ? { isNew: true } : {})
      };
    })
    .filter((item) => item.name !== undefined && item.name.length > 0) as Array<MenuItem & { name?: string }>;

  if (!next.length) return;
  MENU_ITEMS.splice(0, MENU_ITEMS.length, ...next.map(({ name: _name, ...item }) => item));
}
