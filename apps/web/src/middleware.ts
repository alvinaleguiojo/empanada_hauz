import { NextRequest, NextResponse } from "next/server";

const privateRoutes = [
  "/analytics",
  "/batches",
  "/dashboard",
  "/deliveries",
  "/inbox",
  "/inventory",
  "/kitchen",
  "/orders"
];

const publicRoutes = ["/customer", "/queue"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("empanada-token")?.value;
  const hasValidToken = Boolean(token && !isJwtExpired(token));

  if (pathname === "/login" && hasValidToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/" && !hasValidToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  if (privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) && !hasValidToken) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/customer", "/queue", "/analytics/:path*", "/batches/:path*", "/dashboard/:path*", "/deliveries/:path*", "/inbox/:path*", "/inventory/:path*", "/kitchen/:path*", "/orders/:path*"]
};

function isJwtExpired(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return true;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 <= Date.now() : false;
  } catch {
    return true;
  }
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}
