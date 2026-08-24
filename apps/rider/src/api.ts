import * as SecureStore from "expo-secure-store";
import { DeliveryJob, RiderProfile, RiderStatus } from "./types";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");
export const TOKEN_KEY = "empanada-hauz-rider-token";

export class ApiError extends Error {}

async function request<T>(path: string, token?: string | null, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export function saveToken(token: string) {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function readToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function clearToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function login(email: string, password: string) {
  return request<{ accessToken: string; user: { role: string; name: string; email: string } }>(
    "/auth/login",
    undefined,
    { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }
  );
}

export function getRiderProfile(token: string) {
  return request<RiderProfile>("/rider/me", token);
}

export function getRiderJobs(token: string) {
  return request<DeliveryJob[]>("/rider/jobs", token);
}

export function updateRiderStatus(token: string, status: RiderStatus) {
  return request<RiderProfile>("/rider/status", token, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function updateRiderLocation(
  token: string,
  payload: { latitude: number; longitude: number; heading?: number; speed?: number; accuracy?: number }
) {
  return request("/rider/location", token, { method: "POST", body: JSON.stringify(payload) });
}

export function updateJobStatus(token: string, jobId: string, status: string, finalFare?: number) {
  return request<DeliveryJob>(`/rider/jobs/${jobId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(finalFare != null ? { finalFare } : {}) })
  });
}
