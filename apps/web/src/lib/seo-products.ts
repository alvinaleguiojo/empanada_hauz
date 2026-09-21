import { API_URL } from "@/lib/config";

export type SeoProduct = {
  _id?: string;
  name: string;
  description?: string | null;
  category?: string;
  price: number;
  available?: boolean;
  imageUrl?: string | null;
  imageUrls?: string[];
  tags?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  sortOrder?: number;
};

const legacySlugNames: Record<string, string[]> = {
  "pork-empanada": ["pork regular", "pork empanada"],
  "pork-with-egg-empanada": ["pork with egg"],
  "ham-and-cheese-empanada": ["ham & cheese", "ham and cheese", "ham and cheese empanada"],
  "chicken-empanada": ["chicken"],
  "ube-empanada": ["ube with cheese", "ube", "ube empanada"],
  "choco-empanada": ["choco flavor", "choco", "chocolate", "choco empanada"],
};

export function productSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveProductImage(url?: string | null) {
  const value = url?.trim();
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${API_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

export type ProductRatingSummary = {\n  productKey: string;\n  ratingValue: number;\n  reviewCount: number;\n};\n\nexport async function getProductRatingSummaries(): Promise<ProductRatingSummary[]> {\n  try {\n    const response = await fetch(`${API_URL}/products/reviews/summary`, { cache: "no-store" });\n    if (!response.ok) return [];\n    return (await response.json()) as ProductRatingSummary[];\n  } catch {\n    return [];\n  }\n}\n\nexport async function getSeoProducts(): Promise<SeoProduct[]> {
  try {
    const response = await fetch(`${API_URL}/products`, {
      next: { revalidate: 300 },
    });

    if (!response.ok) return [];

    const products = (await response.json()) as SeoProduct[];
    return products
      .filter((product) => product?.name?.trim())
      .sort(
        (a, b) =>
          Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name),
      );
  } catch {
    return [];
  }
}

export function findSeoProduct(products: SeoProduct[], slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();

  const current = products.find(
    (product) => productSlug(product.name) === normalizedSlug,
  );

  if (current) return { product: current, canonicalSlug: productSlug(current.name) };

  const legacyNames = legacySlugNames[normalizedSlug];
  if (!legacyNames) return null;

  const legacyProduct = products.find((product) =>
    legacyNames.some(
      (name) => product.name.trim().toLowerCase() === name,
    ),
  );

  return legacyProduct
    ? { product: legacyProduct, canonicalSlug: productSlug(legacyProduct.name) }
    : null;
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
