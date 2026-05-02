import { makeProductList } from "./models.js";

const DEFAULT_SEARCH_CACHE_TTL_SECONDS = 300;
const DEFAULT_SEARCH_CACHE_MAX_ENTRIES = 512;

const cache = new Map();
const inFlight = new Map();

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

function cloneProductList(result) {
  return makeProductList(structuredClone(result));
}

function trimCache() {
  const max = maxEntries();
  if (max <= 0) {
    cache.clear();
    return;
  }
  while (cache.size > max) {
    let oldestKey = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt < oldestExpiry) {
        oldestKey = key;
        oldestExpiry = entry.expiresAt;
      }
    }
    if (oldestKey === null) {
      break;
    }
    cache.delete(oldestKey);
  }
}

export async function cachedNativeSearch(adapter, { query, page, category = null }) {
  const ttl = ttlSeconds();
  if (ttl <= 0) {
    return adapter.search(query, { page, category });
  }

  const key = `${adapter.store}::${query.trim().toLowerCase()}::${category?.id ?? ""}::${page}`;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) {
    return cloneProductList(entry.result);
  }
  if (entry) {
    cache.delete(key);
  }

  let promise = inFlight.get(key);
  let created = false;
  if (!promise) {
    promise = adapter.search(query, { page, category });
    inFlight.set(key, promise);
    created = true;
  }

  try {
    const result = await promise;
    if (created) {
      inFlight.delete(key);
      cache.set(key, {
        expiresAt: Date.now() + ttl * 1000,
        result: cloneProductList(result)
      });
      trimCache();
    }
    return cloneProductList(result);
  } catch (error) {
    if (created) {
      inFlight.delete(key);
    }
    throw error;
  }
}

export function clearSearchCache() {
  cache.clear();
  inFlight.clear();
}
