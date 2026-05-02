import { ProductNotResolvedError } from "../errors.js";
import { makePrice, makeProduct, makeProductList } from "../models.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getJson, getText } from "../utils/http.js";
import { absoluteUrl, soupFromHtml } from "../utils/html.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { normalizeAvailability } from "../utils/availability.js";
import { toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class UltraAdapter {
  constructor() {
    this.store = "ultra";
    this.base_url = "https://ultra.md";
  }

  async search(query, { page = 1 } = {}) {
    const url = `${this.base_url}/search/categories?page=${page}&search=${encodeURIComponent(query)}`;
    const data = await getJson(url);
    const payload = data.data || {};

    return makeProductList({
      store: this.store,
      query,
      page,
      page_size: this.intOrNull(payload.product_page_limit),
      products: await this.enrichAvailability(this.parseSearchItems(payload.products)),
      total: this.intOrNull(payload.total)
    });
  }

  async getById(sourceId) {
    const identity = await getIdentity(this.store, sourceId);
    if (identity?.url) {
      return this.getByUrl(identity.url);
    }

    throw new ProductNotResolvedError(
      this.store,
      sourceId,
      "Ultra product ID is not cached yet. Use search or by-url to resolve it first."
    );
  }

  async getByUrl(url) {
    const html = await getText(url);
    const jsonld = findProductJsonLd(html);
    if (!jsonld) {
      throw new Error(`Ultra product URL not parseable: ${url}`);
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

  parseSearchItems(fragment) {
    if (!fragment) {
      return [];
    }

    const $ = soupFromHtml(fragment);
    const products = [];
    const seen = new Set();

    $(".search-modal__item").each((_, element) => {
      const item = $(element);
      const url = absoluteUrl(this.base_url, item.attr("href"));
      const sourceId = this.textFrom(item, ".search-modal__code-num");
      if (!sourceId || seen.has(sourceId)) {
        return;
      }
      seen.add(sourceId);

      const image = absoluteUrl(this.base_url, item.find("img").first().attr("src"));
      const product = makeProduct({
        store: this.store,
        source_id: sourceId,
        sku: sourceId,
        name: this.textFrom(item, ".search-modal__name") || "Unknown product",
        url,
        image,
        images: image ? [image] : [],
        price: makePrice({
          current: this.priceFromText(this.textFrom(item, ".search-modal__price-new")),
          old: this.priceFromText(this.textFrom(item, ".search-modal__price-old")),
          currency: "MDL"
        }),
        availability: "unknown",
        short_description: this.textFrom(item, ".search-modal__specs"),
        source_type: "html_fragment_json",
        raw: { url }
      });

      void saveIdentity({
        store: this.store,
        source_id: product.source_id,
        sku: product.sku,
        url: product.url,
        name: product.name
      });

      products.push(product);
    });

    return products;
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
    const availabilityText = $(".product-details__availability .badge").first().text().trim().replace(/\s+/g, " ");
    return normalizeAvailability(availabilityText);
  }

  textFrom(scope, selector) {
    const value = scope.find(selector).first().text().trim().replace(/\s+/g, " ");
    return value || null;
  }

  priceFromText(text) {
    if (!text) {
      return null;
    }
    const match = text.match(/\d[\d\s.,]*/);
    return match ? toFloat(match[0]) : null;
  }

  intOrNull(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
