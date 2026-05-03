import { ProductNotResolvedError } from "../errors.js";
import { categoryForStore } from "../categories.js";
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

  async search(query, { page = 1, category = null, sort = null } = {}) {
    const storeCategory = categoryForStore(category, this.store);
    if (storeCategory || sort) {
      return this.categorySearch(query, { page, category, storeCategory, sort });
    }

    const url = `${this.base_url}/search/categories?page=${page}&search=${encodeURIComponent(query)}`;
    const data = await getJson(url);
    const payload = data.data || {};

    return makeProductList({
      store: this.store,
      query,
      category: null,
      sort,
      page,
      page_size: this.intOrNull(payload.product_page_limit),
      products: await this.enrichAvailability(this.parseSearchItems(payload.products)),
      total: this.intOrNull(payload.total)
    });
  }

  async categorySearch(query, { page, category, storeCategory, sort }) {
    const params = new URLSearchParams({ search: query });
    if (storeCategory) {
      params.set("category", String(storeCategory.id));
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    this.applySort(params, sort);
    const html = await getText(`${this.base_url}/search?${params.toString()}`);
    const $ = soupFromHtml(html);
    return makeProductList({
      store: this.store,
      query,
      category: category?.id ?? null,
      sort,
      page,
      page_size: this.intOrNull(this.textFrom($(".pagination").first(), null)?.match(/Afișat\s+\d+\s+pe\s+(\d+)/i)?.[1]) || null,
      products: this.parseCategoryCards($),
      total: this.totalFromCategorySearch($)
    });
  }

  applySort(params, sort) {
    if (sort === "price_asc") {
      params.set("sort[col]", "price");
      params.set("sort[dir]", "asc");
    } else if (sort === "price_desc") {
      params.set("sort[col]", "price");
      params.set("sort[dir]", "desc");
    } else if (sort === "popularity") {
      params.set("sort[col]", "popularity");
      params.set("sort[dir]", "desc");
    }
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

  parseCategoryCards($) {
    const products = [];
    const seen = new Set();

    $(".product-card[data-code]").each((_, element) => {
      const card = $(element);
      const sourceId = card.attr("data-code");
      if (!sourceId || seen.has(sourceId)) {
        return;
      }
      seen.add(sourceId);

      const link = card.find(".product-card__link[href]").first();
      const url = absoluteUrl(this.base_url, link.attr("href"));
      const image = absoluteUrl(this.base_url, card.find(".product-card__image").first().attr("src"));
      const product = makeProduct({
        store: this.store,
        source_id: sourceId,
        sku: sourceId,
        name: this.textFrom(card, ".product-card__title") || "Unknown product",
        url,
        image,
        images: image ? [image] : [],
        price: makePrice({
          current: this.priceFromText(this.textFrom(card, ".product-card__current-price")),
          old: this.priceFromText(this.textFrom(card, ".product-card__old-price")),
          currency: "MDL"
        }),
        availability: card.find(".product-card__add-to-cart").length ? "in_stock" : normalizeAvailability(card.text()),
        short_description: this.textFrom(card, ".product-card__specs-title"),
        source_type: "html_card",
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

  totalFromCategorySearch($) {
    const text = $(".filtered-product-list__cards-data").first().text().trim().replace(/\s+/g, " ");
    const match = text.match(/Total:\s*(\d[\d\s]*)/i) || $.root().text().match(/din\s+(\d[\d\s]*)\s+rezultate/i);
    return match ? Number.parseInt(match[1].replaceAll(" ", ""), 10) : null;
  }

  textFrom(scope, selector) {
    const target = selector ? scope.find(selector).first() : scope;
    const value = target.text().trim().replace(/\s+/g, " ");
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
