import { bearerTokenFromRequest } from "../auth/apiKeys.js";
import { getApiKeyByValue, touchApiKeyUsage } from "../storage/apiKeys.js";
import { logWarn } from "../utils/logger.js";

export async function requireAdminToken(req, res, next) {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
      return res.status(503).json({ detail: "ADMIN_TOKEN is not configured" });
    }

    const token = bearerTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ detail: "Bearer token is required" });
    }
    if (token !== adminToken) {
      logWarn("admin auth rejected", { path: req.path, ip: req.ip });
      return res.status(403).json({ detail: "Invalid admin token" });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export async function requireApiKey(req, res, next) {
  try {
    const token = bearerTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ detail: "Bearer API key is required" });
    }

    const apiKey = await getApiKeyByValue(token);
    if (!apiKey || apiKey.revoked_at) {
      logWarn("api key rejected", { path: req.path, ip: req.ip });
      return res.status(401).json({ detail: "Invalid or revoked API key" });
    }

    await touchApiKeyUsage(apiKey.id);
    req.apiKey = apiKey;
    return next();
  } catch (error) {
    return next(error);
  }
}
