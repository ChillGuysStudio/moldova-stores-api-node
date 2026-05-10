import { makeProduct, makeProductList } from "./models.js";

const DEFAULT_SEARCH_CACHE_TTL_SECONDS = 300;
const DEFAULT_SEARCH_CACHE_MAX_ENTRIES = 512;

const searchCache = new Map();
const searchInFlight = new Map();
const productCache = new Map();
const urlIndex = new Map();
const identityIndex = new Map();
const productInFlight = new Map();

function intFromEnv(name, defaultValue) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? String(defaultValue), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function ttlSeconds() {
  return intFromEnv("SEARCH_CACHE_TTL_SECONDS", DEFAULT_SEARCH_CACHE_TTL_SECONDS);
}

function maxEntries() {
  return intFromEnv("SEARCH_CACHE_MAX_ENTRIES", DEFAULT_SEARCH_CACHE_MAX_ENTRIES);
}

function cloneProduct(product) {
  return makeProduct(structuredClone(product));
}

function cloneProductList(result) {
  return makeProductList(structuredClone(result));
}

function withScrapeMetadata(product, fallbackTimestamp, scrapeSource) {
  return makeProduct({
    ...product,
    last_scraped_at: product.last_scraped_at ?? fallbackTimestamp,
    scrape_source: product.scrape_source ?? scrapeSource
  });
}

function withSearchScrapeMetadata(result, fallbackTimestamp) {
  return makeProductList({
    ...result,
    products: (result.products ?? []).map((product) =>
      withScrapeMetadata(product, fallbackTimestamp, "search"))
  });
}

function withDetailScrapeMetadata(product, fallbackTimestamp) {
  return withScrapeMetadata(product, fallbackTimestamp, "detail");
}

function trimSearchCache() {
  const max = maxEntries();
  if (max <= 0) {
    searchCache.clear();
    return;
  }
  while (searchCache.size > max) {
    let oldestKey = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of searchCache.entries()) {
      if (entry.expiresAt < oldestExpiry) {
        oldestKey = key;
        oldestExpiry = entry.expiresAt;
      }
    }
    if (oldestKey === null) {
      break;
    }
    searchCache.delete(oldestKey);
  }
}

function trimProductCache() {
  const max = maxEntries();
  if (max <= 0) {
    productCache.clear();
    urlIndex.clear();
    identityIndex.clear();
    return;
  }
  while (productCache.size > max) {
    let oldestKey = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of productCache.entries()) {
      if (entry.expiresAt < oldestExpiry) {
        oldestKey = key;
        oldestExpiry = entry.expiresAt;
      }
    }
    if (oldestKey === null) {
      break;
    }
    productCache.delete(oldestKey);
  }
}

function normalizedProductUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.host = parsed.host.toLowerCase();
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return null;
  }
}

function identityKey(product) {
  if (!product?.store || !product?.source_id) {
    return null;
  }
  return `${String(product.store).trim().toLowerCase()}::${String(product.source_id).trim()}`;
}

function cleanupAlias(aliasMap, aliasKey, cacheKey) {
  if (aliasKey) {
    const current = aliasMap.get(aliasKey);
    if (current === cacheKey) {
      aliasMap.delete(aliasKey);
    }
  }
}

function cacheProduct(product, expiresAt) {
  const urlKey = normalizedProductUrl(product.url);
  const productIdentityKey = identityKey(product);
  const cacheKey = productIdentityKey ?? (urlKey ? `url::${urlKey}` : null);
  if (!cacheKey) {
    return;
  }

  productCache.set(cacheKey, {
    expiresAt,
    product: cloneProduct(product)
  });
  if (urlKey) {
    urlIndex.set(urlKey, cacheKey);
  }
  if (productIdentityKey) {
    identityIndex.set(productIdentityKey, cacheKey);
  }
  trimProductCache();
}

function cacheProducts(products, expiresAt) {
  for (const product of products ?? []) {
    cacheProduct(product, expiresAt);
  }
}

function cachedProductFromUrl(url) {
  const urlKey = normalizedProductUrl(url);
  if (!urlKey) {
    return null;
  }

  const cacheKey = urlIndex.get(urlKey);
  if (!cacheKey) {
    return null;
  }

  const entry = productCache.get(cacheKey);
  const now = Date.now();
  if (!entry || entry.expiresAt <= now) {
    productCache.delete(cacheKey);
    cleanupAlias(urlIndex, urlKey, cacheKey);
    cleanupAlias(identityIndex, identityKey(entry?.product), cacheKey);
    return null;
  }

  return cloneProduct(entry.product);
}

export async function cachedNativeSearch(adapter, { query, page, category = null, sort = null }) {
  const ttl = ttlSeconds();
  if (ttl <= 0) {
    const result = await adapter.search(query, { page, category, sort });
    return withSearchScrapeMetadata(result, new Date().toISOString());
  }

  const key = `${adapter.store}::${query.trim().toLowerCase()}::${category?.id ?? ""}::${sort ?? ""}::${page}`;
  const now = Date.now();
  const entry = searchCache.get(key);
  if (entry && entry.expiresAt > now) {
    return cloneProductList(entry.result);
  }
  if (entry) {
    searchCache.delete(key);
  }

  let promise = searchInFlight.get(key);
  let created = false;
  if (!promise) {
    const timestamp = new Date().toISOString();
    promise = adapter.search(query, { page, category, sort })
      .then((result) => withSearchScrapeMetadata(result, timestamp));
    searchInFlight.set(key, promise);
    created = true;
  }

  try {
    const result = await promise;
    if (created) {
      searchInFlight.delete(key);
      const expiresAt = Date.now() + ttl * 1000;
      searchCache.set(key, {
        expiresAt,
        result: cloneProductList(result)
      });
      cacheProducts(result.products, expiresAt);
      trimSearchCache();
    }
    return cloneProductList(result);
  } catch (error) {
    if (created) {
      searchInFlight.delete(key);
    }
    throw error;
  }
}

export async function cachedProductByUrl(adapter, url) {
  const ttl = ttlSeconds();
  if (ttl <= 0) {
    const product = await adapter.getByUrl(url);
    return withDetailScrapeMetadata(product, new Date().toISOString());
  }

  const cached = cachedProductFromUrl(url);
  if (cached) {
    return cached;
  }

  const cacheKey = normalizedProductUrl(url) ?? `${adapter.store}::${url}`;
  let promise = productInFlight.get(cacheKey);
  let created = false;
  if (!promise) {
    const timestamp = new Date().toISOString();
    promise = adapter.getByUrl(url)
      .then((product) => withDetailScrapeMetadata(product, timestamp));
    productInFlight.set(cacheKey, promise);
    created = true;
  }

  try {
    const product = await promise;
    if (created) {
      productInFlight.delete(cacheKey);
      cacheProduct(product, Date.now() + ttl * 1000);
    }
    return cloneProduct(product);
  } catch (error) {
    if (created) {
      productInFlight.delete(cacheKey);
    }
    throw error;
  }
}

export function clearSearchCache() {
  searchCache.clear();
  searchInFlight.clear();
  productCache.clear();
  urlIndex.clear();
  identityIndex.clear();
  productInFlight.clear();
}
