import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://empanadahauz.com",
  "https://www.empanadahauz.com"
]);

export async function GET(request: Request) {
  const origin = request.headers.get("origin");

  // Browser requests from the production site are allowed. Requests without
  // an Origin header are also allowed because some same-origin fetches and
  // server/runtime probes may omit it. The Google Cloud key restrictions
  // remain the primary security control for the browser key.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps API key is not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { apiKey },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}
