import { ProductNotResolvedError } from "../errors.js";
import { makePrice, makeProduct, makeProductList } from "../models.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getJson, getText } from "../utils/http.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { soupFromHtml } from "../utils/html.js";
import { normalizeAvailability } from "../utils/availability.js";
import { normalizeCurrency, toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class EnterAdapter {
  constructor() {
    this.store = "enter";
    this.base_url = "https://enter.online";
  }

  async search(query, { page = 1 } = {}) {
    const url = `${this.base_url}/search-fetch?q=${encodeURIComponent(query)}&page=${page}`;
    const data = await getJson(url);
    const payload = data.data || {};
    return makeProductList({
      store: this.store,
      query,
      page,
      products: await this.enrichAvailability((payload.products || []).map((item) => this.fromSearchItem(item))),
      total: payload.total ?? null
    });
  }

  async getById(sourceId) {
    const identity = await getIdentity(this.store, sourceId);
    if (identity?.url) {
      return this.getByUrl(identity.url);
    }
    throw new ProductNotResolvedError(this.store, sourceId);
  }

  async getByUrl(url) {
    const html = await getText(url);
    const jsonld = findProductJsonLd(html);
    if (!jsonld) {
      throw new Error(`Enter product URL not parseable: ${url}`);
    }
    const product = productFromJsonLd(this.store, jsonld, url);
    if (product.availability === "unknown") {
      product.availability = this.availabilityFromProductHtml(html);
    }
    await saveIdentity({
      store: this.store,
      source_id: product.source_id,
      sku: product.sku,
      url: product.url || url,
      name: product.name
    });
    return product;
  }

  fromSearchItem(item) {
    const image = item.image ?? null;
    const price = item.price || {};
    const product = makeProduct({
      store: this.store,
      source_id: item.id !== undefined && item.id !== null ? String(item.id) : null,
      sku: item.id !== undefined && item.id !== null ? String(item.id) : null,
      name: String(item.name || "Unknown product"),
      brand: item.brand ?? null,
      category: null,
      url: item.url ?? null,
      image,
      images: image ? [image] : [],
      price: makePrice({
        current: toFloat(price.current_price),
        old: toFloat(price.old),
        currency: normalizeCurrency(price.currency)
      }),
      availability: "unknown",
      short_description: item.short_description ?? null,
      source_type: "json_api",
      raw: item
    });
    void saveIdentity({
      store: this.store,
      source_id: product.source_id,
      sku: product.sku,
      url: product.url,
      name: product.name
    });
    return product;
  }

  async enrichAvailability(products) {
    const workers = Array.from({ length: Math.min(4, products.length) }, async (_, workerIndex) => {
      for (let index = workerIndex; index < products.length; index += 4) {
        const product = products[index];
        if (product.availability !== "unknown" || !product.url) {
          continue;
        }
        try {
          product.availability = await this.availabilityFromUrl(product.url);
        } catch {
          product.availability = "unknown";
        }
      }
    });
    await Promise.all(workers);
    return products;
  }

  async availabilityFromUrl(url) {
    const html = await getText(url);
    const jsonld = findProductJsonLd(html);
    if (jsonld) {
      const product = productFromJsonLd(this.store, jsonld, url);
      if (product.availability !== "unknown") {
        return product.availability;
      }
    }
    return this.availabilityFromProductHtml(html);
  }

  availabilityFromProductHtml(html) {
    const $ = soupFromHtml(html);
    const availabilityText = $(".stock, [class*='stock'], [class*='availability']")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ");
    return normalizeAvailability(availabilityText);
  }
}
