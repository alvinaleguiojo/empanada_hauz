import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Google Maps API key is not configured" }, { status: 503 });
  }

  return NextResponse.json(
    { apiKey },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
