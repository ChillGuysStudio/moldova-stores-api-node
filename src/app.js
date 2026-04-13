import express from "express";
import { buildOpenApiDocument, swaggerHtml } from "./openapi.js";
import { productsRouter } from "./routes/products.js";
import { storesRouter } from "./routes/stores.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(storesRouter);
  app.use("/products", productsRouter);
  app.get("/openapi.json", async (_req, res) => {
    res.json(buildOpenApiDocument());
  });
  app.get("/docs", async (_req, res) => {
    res.type("html").send(swaggerHtml());
  });
  app.get("/ping", async (_req, res) => {
    res.json({ status: "ok" });
  });
  return app;
}
