import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAdminToken, requireApiKey } from "./middleware/auth.js";
import { buildOpenApiDocument, swaggerHtml } from "./openapi.js";
import { adminRouter } from "./routes/admin.js";
import { productsRouter } from "./routes/products.js";
import { storesRouter } from "./routes/stores.js";
import { logError, logInfo } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

function requestBaseUrl(req) {
  const protoHeader = req.get("x-forwarded-proto");
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = protoHeader ? protoHeader.split(",")[0].trim() : req.protocol;
  if (!host) {
    return undefined;
  }
  return `${proto}://${host}`;
}

export function createApp() {
  const app = express();
  app.use(express.json());
  app.set("trust proxy", true);
  app.use((req, _res, next) => {
    if (
      req.path === "/ping" ||
      req.path === "/docs" ||
      req.path === "/openapi.json" ||
      req.path.startsWith("/products")
    ) {
      logInfo("request", {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip
      });
    }
    next();
  });
  app.get("/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  app.get("/index.html", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  app.use("/admin", requireAdminToken, adminRouter);
  app.use(requireApiKey, storesRouter);
  app.use("/products", requireApiKey, productsRouter);
  app.get("/openapi.json", (req, res) => {
    res.json(buildOpenApiDocument(requestBaseUrl(req)));
  });
  app.get("/docs", (_req, res) => {
    res.type("html").send(swaggerHtml());
  });
  app.get("/ping", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use((req, res) => {
    res.status(404).json({
      detail: `Route not found: ${req.method} ${req.originalUrl}`
    });
  });
  app.use((error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : String(error);
    logError("express error", error);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ detail: message });
  });
  return app;
}
