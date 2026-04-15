import express from "express";
import { STORE_CAPABILITIES } from "../config.js";
import { requireApiKey } from "../middleware/auth.js";

export const storesRouter = express.Router();

storesRouter.get("/stores", requireApiKey, (_req, res) => {
  res.json(Object.values(STORE_CAPABILITIES));
});
