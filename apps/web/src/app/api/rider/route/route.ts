import { NextRequest, NextResponse } from "next/server";

type Point = { latitude: number; longitude: number };

function validPoint(point: unknown): point is Point {
  if (!point || typeof point !== "object") return false;
  const value = point as Record<string, unknown>;
  return Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)) && Math.abs(Number(value.latitude)) <= 90 && Math.abs(Number(value.longitude)) <= 180;
}

export async function GET(request: NextRequest) {
  const origin = { latitude: Number(request.nextUrl.searchParams.get("originLat")), longitude: Number(request.nextUrl.searchParams.get("originLng")) };
  const destination = { latitude: Number(request.nextUrl.searchParams.get("destLat")), longitude: Number(request.nextUrl.searchParams.get("destLng")) };
  if (!validPoint(origin) || !validPoint(destination)) return NextResponse.json({ error: "Invalid route coordinates" }, { status: 400 });

  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");

  try {
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    const payload = await response.text();
    if (!response.ok) return NextResponse.json({ error: `Routing service returned ${response.status}` }, { status: 502 });
    return new NextResponse(payload, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Routing service unavailable" }, { status: 502 });
  }
}
