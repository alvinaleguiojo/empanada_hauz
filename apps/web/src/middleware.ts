import { NextRequest, NextResponse } from "next/server";

const adminRoutes = [
  "/analytics", "/batches", "/dashboard", "/deliveries", "/inbox", "/inventory", "/kitchen", "/orders", "/referrals", "/referral-chat", "/settings"
];
const publicRoutes = ["/", "/customer"];
const referralPublicRoutes = ["/referrals/signup", "/referrals/login"];
const referralProtectedRoutes = ["/referrals/dashboard", "/referrals/pending", "/referrals/chat"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminToken = request.cookies.get("empanada-token")?.value;
  const riderToken = request.cookies.get("empanada-rider-token")?.value;
  const referralToken = request.cookies.get("empanada-referral-token")?.value;
  const hasAdminToken = Boolean(adminToken && !isJwtExpired(adminToken));
  const hasRiderToken = Boolean(riderToken && !isJwtExpired(riderToken));
  const hasReferralToken = Boolean(referralToken && !isJwtExpired(referralToken));

  if (pathname === "/rider/login") {
    if (hasRiderToken) return NextResponse.redirect(new URL("/rider", request.url));
    return NextResponse.next();
  }

  if (pathname === "/login") {
    // Rider destinations must use the dedicated rider authentication flow.
    const next = request.nextUrl.searchParams.get("next");
    if (next === "/rider" || next?.startsWith("/rider/")) {
      const url = new URL("/rider/login", request.url);
      url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
    if (hasRiderToken) return NextResponse.redirect(new URL("/rider", request.url));
    if (hasAdminToken) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (pathname === "/rider" || pathname.startsWith("/rider/")) {
    if (hasRiderToken) return NextResponse.next();
    const url = new URL("/rider/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (referralPublicRoutes.includes(pathname)) {
    if (hasReferralToken) return NextResponse.redirect(new URL("/referrals/dashboard", request.url));
    return NextResponse.next();
  }
  if (referralProtectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (hasReferralToken) return NextResponse.next();
    if (pathname.startsWith("/referrals/chat") && hasAdminToken && !hasRiderToken) return NextResponse.next();
    return NextResponse.redirect(new URL("/referrals/login", request.url));
  }

  if (publicRoutes.includes(pathname)) return NextResponse.next();

  if (adminRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (hasRiderToken) return NextResponse.redirect(new URL("/rider", request.url));
    if (!hasAdminToken) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      if (getJwtRole(adminToken!) !== "admin") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/", "/login", "/customer", "/rider/:path*", "/rider",
    "/analytics/:path*", "/batches/:path*", "/dashboard/:path*", "/deliveries/:path*", "/inbox/:path*", "/inventory/:path*", "/kitchen/:path*", "/orders/:path*",
    "/referrals/:path*", "/referrals", "/referral-chat/:path*", "/settings/:path*", "/settings"
  ]
};

function isJwtExpired(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return true;
  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 <= Date.now() : false;
  } catch { return true; }
}

function getJwtRole(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { role?: string };
    return decoded.role ?? null;
  } catch { return null; }
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
}
