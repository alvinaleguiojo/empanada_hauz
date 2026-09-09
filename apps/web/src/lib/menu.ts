export type MenuItem = {
  label: string;
  value: string;
  description?: string | null;
  category: string;
  price: number;
  available?: boolean;
  tags: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  imageUrl?: string | null;
};

type ProductCatalogItem = {
  name: string;
  description?: string | null;
  category?: string;
  price: number;
  available: boolean;
  tags?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  imageUrl?: string | null;
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
        description: product.description?.trim() || null,
        category: product.category?.trim() || "uncategorized",
        price: Number(product.price),
        available,
        tags: Array.isArray(product.tags) ? product.tags : [],
        isFeatured: product.isFeatured === true,
        isNew: product.isNew === true,
        imageUrl: product.imageUrl?.trim() || null
      };
    });

  MENU_ITEMS.splice(0, MENU_ITEMS.length, ...next);
}
