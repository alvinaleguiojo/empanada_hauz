import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type Coordinates = { latitude: number; longitude: number };

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
  results?: Array<{ geometry: { location: { lat: number; lng: number } } }>;
};

type RoutesResponse = {
  routes?: Array<{ distanceMeters?: number; duration?: string }>;
  error?: { message?: string };
};

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  constructor(private readonly config: ConfigService) {}

  async estimateRoute(originPoint: RoutePoint, destinationPoint: RoutePoint): Promise<RouteEstimate | null> {
    const apiKey = this.config.get<string>("GOOGLE_MAPS_API_KEY");

    try {
      const [origin, destination] = await Promise.all([
        this.resolveCoordinates(originPoint, apiKey),
        this.resolveCoordinates(destinationPoint, apiKey)
      ]);

      if (!origin || !destination) return null;

      if (apiKey) {
        try {
          const route = await this.computeRoute(origin, destination, apiKey);
          if (route) return this.toRouteEstimate(origin, destination, route.distanceKm, route.durationMinutes);
        } catch (error) {
          this.logger.warn(`Routes API unavailable, using coordinate estimate: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const route = this.estimateRouteFromCoordinates(origin, destination);
      return this.toRouteEstimate(origin, destination, route.distanceKm, route.durationMinutes);
    } catch (error) {
      this.logger.warn(`Unable to estimate route: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async resolveCoordinates(point: RoutePoint, apiKey?: string): Promise<Coordinates | null> {
    const supplied = this.hasValidCoordinates(point) ? { latitude: point.latitude!, longitude: point.longitude! } : null;

    // Coordinates from an address picker are normally authoritative. However,
    // do not trust a stale or obviously remote coordinate for a Philippine
    // delivery address: that was the source of extreme quotes such as 16,443 km.
    if (supplied && this.isExpectedRegion(supplied)) return supplied;

    if (!apiKey) {
      if (supplied) this.logger.warn(`Ignoring out-of-region coordinates for "${point.address}"`);
      return null;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", point.address);
    url.searchParams.set("region", this.config.get<string>("GOOGLE_MAPS_REGION", "ph"));
    url.searchParams.set("components", "country:PH");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);

    const payload = (await response.json()) as GeocodingResponse;
    const result = payload.results?.[0];
    if (payload.status !== "OK" || !result) {
      this.logger.warn(`Geocoding failed for "${point.address}": ${payload.error_message ?? payload.status}`);
      return null;
    }

    const resolved = { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng };
    if (!this.isExpectedRegion(resolved)) {
      this.logger.warn(`Geocoding returned coordinates outside the configured delivery region for "${point.address}"`);
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
    // Broad Philippines bounds. This prevents a partial name from resolving to
    // another country while still allowing delivery coverage anywhere in PH.
    return coordinates.latitude >= 4 && coordinates.latitude <= 22 && coordinates.longitude >= 116 && coordinates.longitude <= 127;
  }

  private async computeRoute(origin: Coordinates, destination: Coordinates, apiKey: string) {
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

    if (!response.ok) throw new Error(`Routes request failed with ${response.status}`);

    const payload = (await response.json()) as RoutesResponse;
    const route = payload.routes?.[0];
    if (!route?.distanceMeters || !route.duration) {
      this.logger.warn(`Routes API returned no route: ${payload.error?.message ?? "missing route"}`);
      return null;
    }

    return {
      distanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.ceil(this.parseDurationSeconds(route.duration) / 60))
    };
  }

  private estimateRouteFromCoordinates(origin: Coordinates, destination: Coordinates) {
    const straightLineKm = this.haversineDistanceKm(origin, destination);
    const multiplier = Number(this.config.get<string>("DELIVERY_DISTANCE_MULTIPLIER", "1.2"));
    const averageSpeedKmph = Number(this.config.get<string>("DELIVERY_AVG_SPEED_KMPH", "25"));
    const distanceKm = Number((straightLineKm * multiplier).toFixed(2));
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
