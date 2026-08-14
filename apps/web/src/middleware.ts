import { NextRequest, NextResponse } from "next/server";

const privateRoutes = [
  "/analytics", "/batches", "/dashboard", "/deliveries", "/inbox", "/inventory", "/kitchen", "/orders", "/referrals"
];
const publicRoutes = ["/", "/customer"];
const referralPublicRoutes = ["/referrals/signup", "/referrals/login"];
const referralProtectedRoutes = ["/referrals/dashboard", "/referrals/pending", "/referrals/chat"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("empanada-token")?.value;
  const referralToken = request.cookies.get("empanada-referral-token")?.value;
  const hasValidToken = Boolean(token && !isJwtExpired(token));
  const hasValidReferralToken = Boolean(referralToken && !isJwtExpired(referralToken));

  if (pathname === "/login" && hasValidToken) return NextResponse.redirect(new URL("/dashboard", request.url));

  if (referralPublicRoutes.includes(pathname)) {
    if (hasValidReferralToken) return NextResponse.redirect(new URL("/referrals/dashboard", request.url));
    return NextResponse.next();
  }

  if (referralProtectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (hasValidReferralToken) return NextResponse.next();
    if (pathname.startsWith("/referrals/chat") && hasValidToken) return NextResponse.next();
    return NextResponse.redirect(new URL("/referrals/login", request.url));
  }

  if (publicRoutes.includes(pathname)) return NextResponse.next();

  if (privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) && !hasValidToken) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/customer", "/analytics/:path*", "/batches/:path*", "/dashboard/:path*", "/deliveries/:path*", "/inbox/:path*", "/inventory/:path*", "/kitchen/:path*", "/orders/:path*", "/referrals/:path*", "/referrals"] };

function isJwtExpired(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return true;
  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 <= Date.now() : false;
  } catch { return true; }
}
function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
}
