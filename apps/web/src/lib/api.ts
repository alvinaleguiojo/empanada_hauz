import { API_URL } from "./config";

export async function apiFetch<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  let resolvedToken = token;
  if (!resolvedToken) {
    if (typeof window !== "undefined") {
      resolvedToken = localStorage.getItem("empanada-token") ?? undefined;
    } else {
      const { cookies } = await import("next/headers");
      resolvedToken = (await cookies()).get("empanada-token")?.value;
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(resolvedToken ? { authorization: `Bearer ${resolvedToken}` } : {}),
      ...(options?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}
