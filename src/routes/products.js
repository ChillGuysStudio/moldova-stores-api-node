import express from "express";
import { ADAPTERS } from "../adapters/index.js";
import { ProductNotResolvedError } from "../errors.js";
import {
  HOST_TO_STORE,
  makeMultiStoreProductSearch,
  makeProductList,
  makeStoreSearchError
} from "../models.js";
import { cachedNativeSearch } from "../searchCache.js";

export const productsRouter = express.Router();

productsRouter.get("/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ detail: "Query parameter q is required" });
  }
  const page = clampPositiveInt(req.query.page, 1);
  const pageSize = clampPositiveInt(req.query.page_size, 20, 100);

  let selectedStores;
  try {
    selectedStores = selectedStoresFromQuery(req.query.stores);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Unsupported store") ? 404 : 400;
    return res.status(status).json({ detail: message });
  }

  const settled = await Promise.allSettled(
    selectedStores.map((store) => searchStore(store, { q: query, page, pageSize }))
  );
  const response = makeMultiStoreProductSearch({
    query,
    page,
    page_size: pageSize,
    stores: selectedStores
  });
  settled.forEach((result, index) => {
    const store = selectedStores[index];
    if (result.status === "fulfilled") {
      response.results[store] = result.value;
      return;
    }
    response.errors[store] = makeStoreSearchError(store, result.reason?.message || String(result.reason));
  });
  return res.json(response);
});

productsRouter.get("/by-url", async (req, res) => {
  const inputUrl = String(req.query.url || "").trim();
  if (!inputUrl) {
    return res.status(400).json({ detail: "Absolute product URL is required" });
  }
  let store;
  try {
    store = storeFromUrl(inputUrl);
  } catch (error) {
    return res.status(400).json({ detail: error.message });
  }
  const adapter = adapterOr404(store, res);
  if (!adapter) {
    return undefined;
  }
  try {
    const product = await adapter.getByUrl(inputUrl);
    return res.json(product);
  } catch (error) {
    return res.status(502).json({ detail: error.message });
  }
});

productsRouter.get("/:store/:sourceId", async (req, res) => {
  const adapter = adapterOr404(req.params.store, res);
  if (!adapter) {
    return undefined;
  }
  try {
    const product = await adapter.getById(req.params.sourceId);
    return res.json(product);
  } catch (error) {
    if (error instanceof ProductNotResolvedError) {
      return res.status(404).json({
        error: "product_id_not_resolved",
        store: error.store,
        source_id: error.source_id,
        message: error.message
      });
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return res.status(404).json({ detail: error.message });
    }
    return res.status(502).json({ detail: error.message || String(error) });
  }
});

function adapterOr404(store, res) {
  const adapter = ADAPTERS[store];
  if (!adapter) {
    res.status(404).json({ detail: `Unsupported store: ${store}` });
    return null;
  }
  return adapter;
}

export async function searchStore(store, { q, page, pageSize }) {
  const adapter = ADAPTERS[store];
  if (!adapter) {
    throw new Error(`Unsupported store: ${store}`);
  }
  return normalizedSearch(adapter, { q, page, pageSize });
}

export async function normalizedSearch(adapter, { q, page, pageSize }) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const products = [];
  const seenNativePages = new Set();
  let total = null;
  let nativePage = 1;

  while (products.length < end) {
    const result = await cachedNativeSearch(adapter, { query: q, page: nativePage });
    if (total === null) {
      total = result.total;
    }
    if (!result.products.length) {
      break;
    }
    const signature = JSON.stringify(result.products.map((product) => product.source_id));
    if (seenNativePages.has(signature)) {
      break;
    }
    seenNativePages.add(signature);
    products.push(...result.products);
    if (total !== null && products.length >= total) {
      break;
    }
    nativePage += 1;
  }

  return makeProductList({
    store: adapter.store,
    query: q,
    page,
    page_size: pageSize,
    products: products.slice(start, end),
    total
  });
}

function selectedStoresFromQuery(stores) {
  const selected = stores
    ? String(stores)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : Object.keys(ADAPTERS);

  if (!selected.length) {
    throw new Error("No stores selected");
  }
  const unsupported = selected.filter((item) => !(item in ADAPTERS));
  if (unsupported.length) {
    throw new Error(`Unsupported store(s): ${unsupported.join(", ")}`);
  }
  return selected;
}

function storeFromUrl(inputUrl) {
  const host = new URL(inputUrl).host.toLowerCase();
  const store = HOST_TO_STORE[host];
  if (!store) {
    throw new Error(`Unsupported product URL host: ${host}`);
  }
  return store;
}

function clampPositiveInt(value, fallback, max = null) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  if (max !== null && parsed > max) {
    return max;
  }
  return parsed;
}
