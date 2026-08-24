import { API_URL } from "./config";
import { getSelectedDeliveryCoordinates } from "./delivery-place";

export async function apiFetch<T>(path: string, options?: RequestInit, token?: string, tokenCookie?: string): Promise<T> {
  const cookieName = tokenCookie ?? (path.startsWith("/rider") ? "empanada-rider-token" : "empanada-token");
  let resolvedToken = token;
  if (!resolvedToken) {
    if (typeof window !== "undefined") {
      resolvedToken = localStorage.getItem(cookieName) ?? undefined;
    } else {
      const { cookies } = await import("next/headers");
      resolvedToken = (await cookies()).get(cookieName)?.value;
    }
  }

  let resolvedPath = path;
  let resolvedOptions = options;

  if (typeof window !== "undefined") {
    const coordinates = getSelectedDeliveryCoordinates();

    if (coordinates && path.startsWith("/orders/delivery-quote")) {
      const separator = path.includes("?") ? "&" : "?";
      resolvedPath = `${path}${separator}latitude=${encodeURIComponent(coordinates.latitude)}&longitude=${encodeURIComponent(coordinates.longitude)}`;
    }

    if (coordinates && path === "/orders/public" && typeof options?.body === "string") {
      try {
        const body = JSON.parse(options.body) as Record<string, unknown>;
        if (body.deliveryMethod === "maxim") {
          resolvedOptions = {
            ...options,
            body: JSON.stringify({
              ...body,
              latitude: coordinates.latitude,
              longitude: coordinates.longitude
            })
          };
        }
      } catch {
        // Leave non-JSON requests unchanged.
      }
    }
  }

  const response = await fetch(`${API_URL}${resolvedPath}`, {
    ...resolvedOptions,
    headers: {
      "content-type": "application/json",
      ...(resolvedToken ? { authorization: `Bearer ${resolvedToken}` } : {}),
      ...(resolvedOptions?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}
