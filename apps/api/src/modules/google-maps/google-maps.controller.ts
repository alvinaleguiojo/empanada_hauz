import { Controller, Get, Headers, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";

const ALLOWED_ORIGINS = new Set([
  "https://empanadahauz.com",
  "https://www.empanadahauz.com"
]);

@Controller("google-maps-key")
export class GoogleMapsController {
  @Get()
  getBrowserApiKey(@Headers("origin") origin?: string) {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      throw new ForbiddenException("Forbidden");
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException("Google Maps API key is not configured");
    }

    return { apiKey };
  }
}
