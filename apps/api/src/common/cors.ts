const defaultAllowedOrigins = [
  "http://localhost:3000",
  "https://web-beta-peach-12.vercel.app",
  "https://empanadahauz.com",
  "https://www.empanadahauz.com"
];

export function resolveCorsOrigin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
  if (!origin || getAllowedOrigins().has(origin)) {
    callback(null, true);
    return;
  }

  callback(null, false);
}

function getAllowedOrigins() {
  const configured = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return new Set([...defaultAllowedOrigins, ...configured]);
}
