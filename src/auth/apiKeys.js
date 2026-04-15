import crypto from "node:crypto";

const API_KEY_PREFIX = "mspa_";

export function bearerTokenFromRequest(req) {
  const header = req.get("authorization");
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey)).digest("hex");
}

export function generateApiKeyValue() {
  return `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

export function makeKeyPrefix(rawKey) {
  return String(rawKey).slice(0, 12);
}

