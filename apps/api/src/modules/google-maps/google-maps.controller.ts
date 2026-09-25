import { Controller, Get, Headers, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "https://empanadahauz.com",
  "https://www.empanadahauz.com"
]);

function getAllowedOrigins() {
  const configured = process.env.CORS_ORIGIN
    ?.split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean) ?? [];

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

@Controller("google-maps-key")
export class GoogleMapsController {
  @Get()
  getBrowserApiKey(@Headers("origin") origin?: string) {
    const normalizedOrigin = origin?.trim().replace(/\/$/, "");

    if (normalizedOrigin && !getAllowedOrigins().has(normalizedOrigin)) {
      throw new ForbiddenException("Forbidden");
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException("Google Maps API key is not configured");
    }

    return { apiKey };
  }
}
