"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const ADSENSE_CLIENT = "ca-pub-2210175902805612";

function shouldLoadAds(pathname: string) {
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/rider") ||
    pathname.startsWith("/customer") ||
    pathname.startsWith("/order") ||
    pathname.startsWith("/track/") ||
    pathname.startsWith("/referrals")
  ) {
    return false;
  }

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
