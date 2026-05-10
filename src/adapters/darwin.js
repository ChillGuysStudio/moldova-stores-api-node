import { ProductNotResolvedError } from "../errors.js";
import { categoryForStore } from "../categories.js";
import { makePrice, makeProduct, makeProductList } from "../models.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getText } from "../utils/http.js";
import { absoluteUrl, soupFromHtml } from "../utils/html.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { normalizeAvailability } from "../utils/availability.js";
import { toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class DarwinAdapter {
  constructor() {
    this.store = "darwin";
    this.base_url = "https://darwin.md";
  }

  async search(query, { page = 1, category = null, sort = null } = {}) {
    const storeCategory = categoryForStore(category, this.store);
    const params = new URLSearchParams({
      keywords: query,
      page: String(page)
    });
    if (storeCategory) {
      params.set("category_id", String(storeCategory.id));
    }
    this.applySort(params, sort);
    const html = await getText(`${this.base_url}/cautare?${params.toString()}`);
    const $ = soupFromHtml(html);
    return makeProductList({
      store: this.store,
      query,
      category: category?.id ?? null,
      sort,
      page,
      products: await this.enrichAvailability(this.parseSearchCards($)),
      total: this.totalFromSearch($)
    });
  }

  applySort(params, sort) {
    const value = {
      price_asc: "price",
      price_desc: "-price",
      popularity: "-popularity"
    }[sort];
    if (value) {
      params.set("sort", value);
    }
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
      throw new Error(`Darwin product URL not parseable: ${url}`);
    }
    const product = productFromJsonLd(this.store, jsonld, url);
    if (!product.source_id) {
      throw new Error(`Darwin product URL is missing canonical product ID: ${url}`);
    }
    product.category = product.category || this.categoryFromBreadcrumbs(html);
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

  parseSearchCards($) {
    const products = [];
    const seen = new Set();
    $(".product-items-5.ga-list .product-card.product-item").each((_, element) => {
      const card = $(element);
      const link = card.find('a.product-link[href$=".html"], a[href$=".html"]').first();
      if (!link.length) {
        return;
      }
      const url = absoluteUrl(this.base_url, link.attr("href"));
      const ga4Item = this.ga4ItemFromLink(link.attr("data-ga4"));
      const sourceId = this.sourceIdFromCard(card);
      if (!url || !sourceId || seen.has(sourceId)) {
        return;
      }
      const name = this.nameFromCard(card, ga4Item);
      if (!name) {
        return;
      }
      seen.add(sourceId);
      const image = this.imageFromCard(card);
      const product = makeProduct({
        store: this.store,
        source_id: sourceId,
        sku: sourceId,
        name,
        brand: ga4Item.item_brand ?? null,
        category: ga4Item.item_category ?? null,
        url,
        image,
        images: image ? [image] : [],
        price: this.priceFromCard(card, ga4Item),
        availability: this.availabilityFromCard(card),
        short_description: this.descriptionFromCard(card, name),
        source_type: "html_card",
        raw: {
          url,
          ga4_item: ga4Item
        }
      });
      void saveIdentity({
        store: this.store,
        source_id: sourceId,
        sku: sourceId,
        url,
        name: product.name
      });
      products.push(product);
    });
    return products;
  }

  async enrichAvailability(products) {
    const unknownProducts = products.filter((product) => product.availability === "unknown" && product.url);
    const workers = Array.from({ length: Math.min(4, unknownProducts.length) }, async (_, workerIndex) => {
      for (let index = workerIndex; index < unknownProducts.length; index += 4) {
        const product = unknownProducts[index];
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

  ga4ItemFromLink(raw) {
    if (!raw) {
      return {};
    }
    try {
      const payload = JSON.parse(raw);
      return payload.ecommerce?.items?.[0] || {};
    } catch {
      return {};
    }
  }

  sourceIdFromCard(card) {
    const livewireKeys = card.find("*").map((_, element) => {
      const raw = element.attribs?.["wire:snapshot"];
      if (!raw) {
        return null;
      }
      try {
        const snapshot = JSON.parse(raw);
        const product = snapshot?.data?.product;
        const descriptor = Array.isArray(product) ? product[1] : null;
        const key = descriptor?.key;
        return key !== undefined && key !== null ? String(key) : null;
      } catch {
        return null;
      }
    }).get().filter(Boolean);
    return livewireKeys[0] ?? null;
  }

  imageFromCard(card) {
    const image = card.find(".product-img img, img").first();
    if (!image.length) {
      return null;
    }
    return absoluteUrl(this.base_url, image.attr("data-src") || image.attr("src"));
  }

  nameFromCard(card, ga4Item) {
    const title = card.find(".title-product").first().text().trim().replace(/\s+/g, " ");
    return title || ga4Item.item_name || null;
  }

  descriptionFromCard(card, name) {
    const description = card.find(".description-product, .product-description, .color-80").first();
    if (description.length) {
      return this.cleanDescription(description.text().trim().replace(/\s+/g, " "));
    }
    const link = card.find('a.product-link[href$=".html"], a[href$=".html"]').first();
    if (!link.length) {
      return null;
    }
    let text = link.text().trim().replace(/\s+/g, " ");
    if (text.startsWith(name)) {
      text = text.slice(name.length).trim();
    }
    text = text.replace(/\bCashback\s+\d+(?:[.,]\d+)?\s+lei\b/gi, "").trim();
    return this.cleanDescription(text);
  }

  cleanDescription(text) {
    const cleaned = text.trim();
    if (!cleaned || cleaned.toLowerCase() === "loading" || cleaned.toLowerCase() === "loading...") {
      return null;
    }
    return cleaned;
  }

  priceFromCard(card, ga4Item) {
    let current = toFloat(ga4Item.price);
    const discount = toFloat(ga4Item.discount);
    const old = current !== null && discount ? current + discount : null;
    if (current === null) {
      const price = card.find(".price, .color-green").first();
      current = price.length ? toFloat(price.text().trim().replace(/\s+/g, " ")) : null;
    }
    return makePrice({
      current,
      old,
      currency: "MDL"
    });
  }

  availabilityFromCard(card) {
    if (card.find(".add-to-cart").length) {
      return "in_stock";
    }
    const cardText = card.text().trim().replace(/\s+/g, " ");
    const normalized = normalizeAvailability(cardText);
    if (normalized !== "unknown") {
      return normalized;
    }
    return "unknown";
  }

  availabilityFromProductHtml(html) {
    const $ = soupFromHtml(html);
    if ($(".add-to-cart").length) {
      return "in_stock";
    }
    return normalizeAvailability($("body").text());
  }

  categoryFromBreadcrumbs(html) {
    const $ = soupFromHtml(html);
    const values = $(".breadcrumb a, .breadcrumbs a")
      .map((_, element) => $(element).text().trim().replace(/\s+/g, " "))
      .get()
      .filter(Boolean)
      .filter((value) => !/pagina principal[aă]|acasa/i.test(value));
    return values.length ? values.at(-1) : null;
  }

  totalFromSearch($) {
    const text = $.root().text().replace(/\s+/g, " ");
    const match = text.match(/Produse\s+g[aă]site:\s*(\d[\d\s]*)/i);
    return match ? Number.parseInt(match[1].replaceAll(" ", ""), 10) : null;
  }
}
