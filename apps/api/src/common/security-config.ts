const INSECURE_JWT_SECRETS = new Set(["change-me", "changeme", "secret", "jwt-secret"]);

export function assertSecureRuntimeConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32 || INSECURE_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
    throw new Error("JWT_SECRET must be a unique production secret with at least 32 characters.");
  }

  const mcpBearerToken = process.env.MCP_BEARER_TOKEN?.trim();
  if (!mcpBearerToken || mcpBearerToken.length < 32) {
    throw new Error("MCP_BEARER_TOKEN must be configured in production with at least 32 characters.");
  }

  const metaTokenEncryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (metaTokenEncryptionKey && !/^[a-f0-9]{64}$/i.test(metaTokenEncryptionKey)) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY must be a 32-byte hex value.");
  }
}
