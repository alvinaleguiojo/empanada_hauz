import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type Coordinates = { latitude: number; longitude: number };

export type LocationCandidate = Coordinates & {
  formattedAddress: string;
};

export type RouteEstimate = {
  origin: Coordinates;
  destination: Coordinates;
  distanceKm: number;
  durationMinutes: number;
  estimatedArrivalAt: Date;
};

type RoutePoint = { address: string; latitude?: number; longitude?: number };

type GeocodingResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
};

type RoutesResponse = {
  routes?: Array<{ distanceMeters?: number; duration?: string }>;
  error?: { message?: string; status?: string };
};

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  constructor(private readonly config: ConfigService) {}

  async findLocationCandidates(address: string, limit = 5): Promise<LocationCandidate[]> {
    const apiKey = this.config.get<string>("GOOGLE_MAPS_API_KEY");
    if (!apiKey || !address?.trim()) return [];

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address.trim());
    url.searchParams.set("region", this.config.get<string>("GOOGLE_MAPS_REGION", "ph"));
    url.searchParams.set("components", "country:PH");
    url.searchParams.set("key", apiKey);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);
      const payload = (await response.json()) as GeocodingResponse;
      if (payload.status !== "OK" || !payload.results?.length) {
        this.logger.warn(`Location candidate search failed for "${address}": ${payload.error_message ?? payload.status}`);
        return [];
      }

      return payload.results
        .map((result) => ({
          formattedAddress: result.formatted_address?.trim() || address.trim(),
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng
        }))
        .filter((candidate) => this.isExpectedRegion(candidate))
        .slice(0, Math.max(1, limit));
    } catch (error) {
      this.logger.warn(`Unable to find location candidates for "${address}": ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async estimateRoute(originPoint: RoutePoint, destinationPoint: RoutePoint): Promise<RouteEstimate | null> {
    const apiKey = this.config.get<string>("GOOGLE_MAPS_API_KEY");

    try {
      let origin = await this.resolveCoordinates(originPoint, apiKey);
      let destination = await this.resolveCoordinates(destinationPoint, apiKey);
      if (!origin || !destination) return null;

      if (apiKey) {
        const firstAttempt = await this.tryComputeRoute(origin, destination, apiKey, "supplied");
        if (firstAttempt) return this.toRouteEstimate(origin, destination, firstAttempt.distanceKm, firstAttempt.durationMinutes);

        const [geocodedOrigin, geocodedDestination] = await Promise.all([
          this.geocodeAddress(originPoint.address, apiKey),
          this.geocodeAddress(destinationPoint.address, apiKey)
        ]);
        if (geocodedOrigin && geocodedDestination && (this.coordinatesDiffer(origin, geocodedOrigin) || this.coordinatesDiffer(destination, geocodedDestination))) {
          this.logger.warn(`Retrying route with geocoded coordinates after no-route response: origin=${this.formatCoordinates(origin)} -> ${this.formatCoordinates(geocodedOrigin)}, destination=${this.formatCoordinates(destination)} -> ${this.formatCoordinates(geocodedDestination)}`);
          const secondAttempt = await this.tryComputeRoute(geocodedOrigin, geocodedDestination, apiKey, "geocoded");
          if (secondAttempt) {
            origin = geocodedOrigin;
            destination = geocodedDestination;
            return this.toRouteEstimate(origin, destination, secondAttempt.distanceKm, secondAttempt.durationMinutes);
          }
        }

        // A failed Google route is NOT a valid delivery quote. Never turn a
        // failed route into a large straight-line distance and fare.
        return null;
      }

      // Google routing is optional for non-AI/internal flows. If no Maps key
      // is configured, retain the bounded local estimate behavior.
      const fallback = this.estimateRouteFromCoordinates(origin, destination);
      return this.toRouteEstimate(origin, destination, fallback.distanceKm, fallback.durationMinutes);
    } catch (error) {
      this.logger.warn(`Unable to estimate route: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async resolveCoordinates(point: RoutePoint, apiKey?: string): Promise<Coordinates | null> {
    const supplied = this.hasValidCoordinates(point) ? { latitude: point.latitude!, longitude: point.longitude! } : null;
    if (supplied && this.isExpectedRegion(supplied)) return supplied;
    if (!apiKey) {
      if (supplied) this.logger.warn(`Ignoring out-of-region coordinates for "${point.address}": ${this.formatCoordinates(supplied)}`);
      return null;
    }
    return this.geocodeAddress(point.address, apiKey);
  }

  private async geocodeAddress(address: string, apiKey: string): Promise<Coordinates | null> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("region", this.config.get<string>("GOOGLE_MAPS_REGION", "ph"));
    url.searchParams.set("components", "country:PH");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);
    const payload = (await response.json()) as GeocodingResponse;
    const result = payload.results?.[0];
    if (payload.status !== "OK" || !result) {
      this.logger.warn(`Geocoding failed for "${address}": ${payload.error_message ?? payload.status}`);
      return null;
    }

    const resolved = { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng };
    if (!this.isExpectedRegion(resolved)) {
      this.logger.warn(`Geocoding returned coordinates outside the configured delivery region for "${address}": ${this.formatCoordinates(resolved)}`);
      return null;
    }
    return resolved;
  }

  private hasValidCoordinates(point: RoutePoint) {
    return typeof point.latitude === "number" && Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90 && typeof point.longitude === "number" && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180;
  }

  private isExpectedRegion(coordinates: Coordinates) {
    const region = this.config.get<string>("GOOGLE_MAPS_REGION", "ph").toLowerCase();
    if (region !== "ph") return true;
    return coordinates.latitude >= 4 && coordinates.latitude <= 22 && coordinates.longitude >= 116 && coordinates.longitude <= 127;
  }

  private async tryComputeRoute(origin: Coordinates, destination: Coordinates, apiKey: string, source: "supplied" | "geocoded") {
    try {
      return await this.computeRoute(origin, destination, apiKey, source);
    } catch (error) {
      this.logger.warn(`Routes API request failed (${source}) origin=${this.formatCoordinates(origin)} destination=${this.formatCoordinates(destination)}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async computeRoute(origin: Coordinates, destination: Coordinates, apiKey: string, source: string) {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": "routes.distanceMeters,routes.duration"
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: this.config.get<string>("GOOGLE_MAPS_TRAVEL_MODE", "TWO_WHEELER"),
        routingPreference: "TRAFFIC_AWARE"
      })
    });

    const raw = await response.text();
    let payload: RoutesResponse = {};
    try { payload = raw ? JSON.parse(raw) as RoutesResponse : {}; } catch { /* keep empty payload for diagnostics */ }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${payload.error?.status ? ` ${payload.error.status}` : ""}: ${payload.error?.message ?? raw.slice(0, 300)}`);
    }

    const route = payload.routes?.[0];
    if (!route?.distanceMeters || !route.duration) {
      this.logger.warn(`Routes API returned no route (${source}): ${payload.error?.message ?? "missing route"}; origin=${this.formatCoordinates(origin)} destination=${this.formatCoordinates(destination)}`);
      return null;
    }

    return {
      distanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.ceil(this.parseDurationSeconds(route.duration) / 60))
    };
  }

  private coordinatesDiffer(a: Coordinates, b: Coordinates) {
    return this.haversineDistanceKm(a, b) > 0.25;
  }

  private formatCoordinates(coordinates: Coordinates) { return `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`; }

  private estimateRouteFromCoordinates(origin: Coordinates, destination: Coordinates) {
    const straightLineKm = this.haversineDistanceKm(origin, destination);
    const multiplier = Number(this.config.get<string>("DELIVERY_DISTANCE_MULTIPLIER", "1.2"));
    const averageSpeedKmph = Number(this.config.get<string>("DELIVERY_AVG_SPEED_KMPH", "25"));
    const distanceKm = Number((straightLineKm * Math.max(multiplier, 1)).toFixed(2));
    const durationMinutes = Math.max(1, Math.ceil((distanceKm / Math.max(averageSpeedKmph, 1)) * 60));
    return { distanceKm, durationMinutes };
  }

  private toRouteEstimate(origin: Coordinates, destination: Coordinates, distanceKm: number, durationMinutes: number): RouteEstimate {
    return { origin, destination, distanceKm, durationMinutes, estimatedArrivalAt: new Date(Date.now() + durationMinutes * 60_000) };
  }

  private haversineDistanceKm(origin: Coordinates, destination: Coordinates) {
    const earthRadiusKm = 6371;
    const latDelta = this.degreesToRadians(destination.latitude - origin.latitude);
    const lonDelta = this.degreesToRadians(destination.longitude - origin.longitude);
    const originLat = this.degreesToRadians(origin.latitude);
    const destinationLat = this.degreesToRadians(destination.latitude);
    const a = Math.sin(latDelta / 2) ** 2 + Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lonDelta / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private degreesToRadians(degrees: number) { return (degrees * Math.PI) / 180; }
  private parseDurationSeconds(duration: string) { return Number(duration.replace("s", "")) || 0; }
}
