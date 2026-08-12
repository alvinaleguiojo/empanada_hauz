export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://empanadahauz.com/api";
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://api.empanadahauz.com/ops";

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
