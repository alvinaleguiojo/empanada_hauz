import type { MetadataRoute } from "next";
import {
  getSeoProducts,
  productSlug,
} from "@/lib/seo-products";

const baseUrl = "https://empanadahauz.com";

const staticRoutes = [
  "",
  "/empanada-cebu",
  "/empanada-delivery-cebu",
  "/empanada-talisay",
  "/menu",
  "/delivery-fee",
  "/privacy",
];

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getSeoProducts();

  const routes = [
    ...staticRoutes,
    ...products.map((product) => `/flavors/${productSlug(product.name)}`),
  ];

  return routes.map((path) => ({
    url: baseUrl + path,
    lastModified: new Date(),
    changeFrequency:
      path === "/privacy" ? ("monthly" as const) : ("weekly" as const),
    priority:
      path === "" ? 1 : path === "/privacy" ? 0.3 : 0.8,
  }));
}
