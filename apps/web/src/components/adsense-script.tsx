"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ADSENSE_CLIENT = "ca-pub-2210175902805612";
const ADSENSE_SCRIPT_ID = "google-adsense";

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

  useEffect(() => {
    if (!shouldLoadAds(pathname)) return;
    if (document.getElementById(ADSENSE_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src =
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

    document.head.appendChild(script);
  }, [pathname]);

  return null;
}
