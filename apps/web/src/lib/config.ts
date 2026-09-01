const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

// The API is deployed separately from the Next.js site. Keep the fallback
// aligned with production so a missing Cloudflare Pages/Workers env var does
// not accidentally send API traffic to the website origin.
export const API_URL = (configuredApiUrl || "https://api.empanadahauz.com/api").replace(/\/$/, "");

const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
export const SOCKET_URL = (configuredSocketUrl || "https://api.empanadahauz.com/ops").replace(/\/$/, "");

const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

export const VOICE_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ...(turnUrls.length > 0 && turnUsername && turnCredential
    ? [
        {
          urls: turnUrls,
          username: turnUsername,
          credential: turnCredential
        }
      ]
    : [])
];
