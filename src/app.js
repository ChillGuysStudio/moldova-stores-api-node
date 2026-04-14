import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument, swaggerHtml } from "./openapi.js";
import { productsRouter } from "./routes/products.js";
import { storesRouter } from "./routes/stores.js";

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
  app.use(express.static(PUBLIC_DIR));
  app.use(storesRouter);
  app.use("/products", productsRouter);
  app.get("/openapi.json", async (req, res) => {
    res.json(buildOpenApiDocument(requestBaseUrl(req)));
  });
  app.get("/docs", async (_req, res) => {
    res.type("html").send(swaggerHtml());
  });
  app.get("/ping", async (_req, res) => {
    res.json({ status: "ok" });
  });
  return app;
}
