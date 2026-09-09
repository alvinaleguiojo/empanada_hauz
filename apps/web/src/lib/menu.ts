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

/** Runtime menu cache populated exclusively from the backend product catalog. */
export const MENU_ITEMS: MenuItem[] = [];

export function replaceMenuItems(products: ProductCatalogItem[]) {
  const next: MenuItem[] = products
    .filter((product) => product.name.trim())
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((product) => {
      const name = product.name.trim();
      const available = product.available !== false;
      return {
        label: available ? name : `${name} — SOLD OUT`,
        value: name,
        price: Number(product.price),
        available
      };
    });

  MENU_ITEMS.splice(0, MENU_ITEMS.length, ...next);
}
