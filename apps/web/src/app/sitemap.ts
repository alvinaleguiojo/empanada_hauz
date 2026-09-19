import type { MetadataRoute } from "next";

const baseUrl = "https://empanadahauz.com";

const publicRoutes = [
  "",
  "/empanada-cebu",
  "/empanada-delivery-cebu",
  "/empanada-talisay",
  "/menu",
  "/flavors/pork-empanada",
  "/flavors/pork-with-egg-empanada",
  "/flavors/ham-and-cheese-empanada",
  "/flavors/chicken-empanada",
  "/flavors/ube-empanada",
  "/flavors/choco-empanada",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((path) => ({
    url: baseUrl + path,
    lastModified: new Date(),
    changeFrequency: path === "/privacy" ? ("monthly" as const) : ("weekly" as const),
    priority: path === "" ? 1 : path === "/privacy" ? 0.3 : 0.8,
  }));
}
