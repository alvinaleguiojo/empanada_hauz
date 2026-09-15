import { API_URL } from "./config";
import { getSelectedDeliveryCoordinates } from "./delivery-place";

const ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;
const ordersGetCache = new Map<string, { expiresAt: number; value: unknown }>();

function isOrdersGet(path: string, method?: string) {
  return (method ?? "GET").toUpperCase() === "GET" && (path === "/orders" || path.startsWith("/orders?"));
}

function clearOrdersGetCache() {
  ordersGetCache.clear();
}

async function resolveApiRequest(path: string, options?: RequestInit, token?: string, tokenCookie?: string) {
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

  const isFormData = typeof FormData !== "undefined" && resolvedOptions?.body instanceof FormData;
  const response = await fetch(`${API_URL}${resolvedPath}`, {
    ...resolvedOptions,
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      ...(resolvedToken ? { authorization: `Bearer ${resolvedToken}` } : {}),
      ...(resolvedOptions?.headers ?? {})
    },
    cache: "no-store"
  });

  return response;
}

export async function apiFetch<T>(path: string, options?: RequestInit, token?: string, tokenCookie?: string): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const cacheKey = `${tokenCookie ?? ""}:${token ?? ""}:${path}`;

  if (isOrdersGet(path, method)) {
    const cached = ordersGetCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    if (cached) ordersGetCache.delete(cacheKey);
  } else if (method !== "GET") {
    clearOrdersGetCache();
  }

  const response = await resolveApiRequest(path, options, token, tokenCookie);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json() as T;

  if (isOrdersGet(path, method)) {
    ordersGetCache.set(cacheKey, { expiresAt: Date.now() + ORDERS_CACHE_TTL_MS, value: data });
  }

  return data;
}

export async function apiFetchBlob(path: string, options?: RequestInit, token?: string, tokenCookie?: string): Promise<Blob> {
  const response = await resolveApiRequest(path, options, token, tokenCookie);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.blob();
}
