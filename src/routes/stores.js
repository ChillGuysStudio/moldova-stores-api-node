import express from "express";
import { STORE_CAPABILITIES } from "../config.js";

export const storesRouter = express.Router();

storesRouter.get("/stores", (_req, res) => {
  res.json(Object.values(STORE_CAPABILITIES));
});
