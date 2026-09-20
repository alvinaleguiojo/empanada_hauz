"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const ADSENSE_CLIENT = "ca-pub-2210175902805612";

/**
 * AdSense is intentionally restricted to public, indexable/content pages.
 * Keep this as an allowlist so new internal application routes never
 * receive AdSense by accident.
 */
function shouldLoadAds(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/menu" ||
    pathname === "/empanada-cebu" ||
    pathname === "/empanada-delivery-cebu" ||
    pathname === "/empanada-talisay" ||
    pathname.startsWith("/flavors/")
  );
}

export function AdsenseScript() {
  const pathname = usePathname();

  if (!shouldLoadAds(pathname)) return null;

  return (
    <Script
      id="google-adsense"
      async
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      crossOrigin="anonymous"
    />
  );
}
