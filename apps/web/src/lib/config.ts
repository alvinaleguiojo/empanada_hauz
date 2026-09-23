const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

// The API is deployed separately from the Next.js site. Keep the fallback
// aligned with production so a missing Cloudflare Pages/Workers env var does
// not accidentally send API traffic to the website origin.
export const API_URL = (configuredApiUrl || "https://api.empanadahauz.com/api").replace(/\/$/, "");

// Socket.IO is served by the NestJS API on the same public origin.
// Derive it from NEXT_PUBLIC_API_URL so a stale/incorrect
// NEXT_PUBLIC_SOCKET_URL cannot send realtime traffic to the Next.js site.
const socketOrigin = API_URL.replace(/\/api\/?$/, "");
export const SOCKET_URL = `${socketOrigin}/ops`;

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
