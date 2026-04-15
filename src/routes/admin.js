import express from "express";
import { createApiKey, listApiKeys, revokeApiKey } from "../storage/apiKeys.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = express.Router();

adminRouter.get("/api-keys", asyncHandler(async (_req, res) => {
  res.json({ items: await listApiKeys() });
}));

adminRouter.post("/api-keys", asyncHandler(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ detail: "Field 'name' is required" });
  }

  const apiKey = await createApiKey({ name });
  return res.status(201).json(apiKey);
}));

adminRouter.post("/api-keys/:id/revoke", asyncHandler(async (req, res) => {
  const apiKey = await revokeApiKey(req.params.id);
  if (!apiKey) {
    return res.status(404).json({ detail: `API key not found: ${req.params.id}` });
  }
  return res.json(apiKey);
}));

