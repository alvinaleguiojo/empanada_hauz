import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard/", "/admin/", "/rider/", "/auth/"],
    },
    sitemap: "https://empanadahauz.com/sitemap.xml",
  };
}
