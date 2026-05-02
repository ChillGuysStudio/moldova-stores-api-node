import { makePrice, makeProduct, makeProductList } from "../models.js";
import { categoryForStore } from "../categories.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getText, postJson } from "../utils/curlClient.js";
import { absoluteUrl, soupFromHtml } from "../utils/html.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { normalizeAvailability } from "../utils/availability.js";
import { toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class BombaAdapter {
  constructor() {
    this.store = "bomba";
    this.base_url = "https://bomba.md";
  }

  async search(query, { page = 1, category = null } = {}) {
    const storeCategory = categoryForStore(category, this.store);
    const params = new URLSearchParams({ query });
    if (page > 1 || storeCategory) {
      params.set("page", String(page));
    }
    if (storeCategory) {
      params.set("stock", "1");
      params.set(`category[${storeCategory.id}]`, String(storeCategory.id));
      params.set("sort", "7");
      params.set("limit", "64");
    }
    const url = `${this.base_url}/ro/cautare/?${params.toString()}`;
    const html = await getText(url, {}, { requireImpersonation: true });
    const $ = soupFromHtml(html);
    return makeProductList({
      store: this.store,
      query,
      category: category?.id ?? null,
      page,
      products: await this.enrichAvailability(this.parseSearchCards($)),
      total: this.totalFromSearch($)
    });
  }

  async getById(sourceId) {
    const data = await postJson(
      `${this.base_url}/product/find_one/`,
      { lang: "ro", id: sourceId },
      {},
      { requireImpersonation: true }
    );
    const product = makeProduct({
      store: this.store,
      source_id: String(data.id ?? sourceId),
      sku: String(data.id ?? sourceId),
      name: String(data.name ?? "Unknown product"),
      brand: data.brand ?? null,
      category: data.category ?? null,
      price: makePrice({
        current: toFloat(data.price),
        old: toFloat(data.discount)
      }),
      availability: this.availabilityFromApiItem(data),
      source_type: "json_api",
      raw: data
    });
    const identity = await getIdentity(this.store, product.source_id);
    if (product.availability === "unknown" && identity?.url) {
      return this.getByUrl(identity.url);
    }
    await saveIdentity({
      store: this.store,
      source_id: product.source_id,
      sku: product.sku,
      name: product.name
    });
    return product;
  }

  async getByUrl(url) {
    const html = await getText(url, {}, { requireImpersonation: true });
    const jsonld = findProductJsonLd(html);
    if (!jsonld) {
      throw new Error(`Bomba product URL not parseable: ${url}`);
    }
    const product = productFromJsonLd(this.store, jsonld, url);
    product.source_type = "json_ld";
    const urlId = this.idFromUrl(url);
    product.source_id = product.source_id || urlId;
    product.sku = product.sku || product.source_id;
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
    $(".product__item").each((_, element) => {
      const card = $(element);
      const link = card.find('a.name[href*="/ro/product/"], a[href*="/ro/product/"]').first();
      if (!link.length) {
        return;
      }
      const href = absoluteUrl(this.base_url, link.attr("href"));
      if (!href) {
        return;
      }
      const productId = link.attr("data-ecom_id") || card.attr("data-id") || this.idFromUrl(href);
      const name = link.text().trim().replace(/\s+/g, " ");
      if (!productId || !name || seen.has(productId)) {
        return;
      }
      seen.add(productId);
      const price = toFloat(link.attr("data-ecom_price") || this.textFrom(card, ".product-price .price"));
      const discount = toFloat(link.attr("data-ecom_discount"));
      const oldPrice = price !== null && discount ? price + discount : null;
      const image = this.imageFromCard(card);
      const product = makeProduct({
        store: this.store,
        source_id: productId,
        sku: productId,
        name,
        brand: link.attr("data-ecom_brand") || null,
        category: link.attr("data-ecom_category") || null,
        url: href,
        image,
        images: image ? [image] : [],
        price: makePrice({ current: price, old: oldPrice }),
        availability: this.availabilityFromCard(card),
        source_type: "html_card",
        raw: {
          data_articol: card.attr("data-articol") || null,
          data_ecom_index: link.attr("data-ecom_index") || null
        }
      });
      void saveIdentity({
        store: this.store,
        source_id: productId,
        sku: productId,
        url: href,
        name
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
    const html = await getText(url, {}, { requireImpersonation: true });
    const jsonld = findProductJsonLd(html);
    if (jsonld) {
      const product = productFromJsonLd(this.store, jsonld, url);
      if (product.availability !== "unknown") {
        return product.availability;
      }
    }
    return this.availabilityFromProductHtml(html);
  }

  availabilityFromCard(card) {
    if (card.find(".button-cart, .check_color_and_size").length) {
      return "in_stock";
    }
    return normalizeAvailability(card.text());
  }

  availabilityFromApiItem(item) {
    const candidates = [
      item.in_stock,
      item.inStock,
      item.available,
      item.availability,
      item.stock,
      item.quantity
    ];
    for (const value of candidates) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      const normalized = normalizeAvailability(value);
      if (normalized !== "unknown") {
        return normalized;
      }
      if (typeof value === "number" && value > 0) {
        return "in_stock";
      }
      if (value === false || value === 0 || value === "0") {
        return "out_of_stock";
      }
    }
    return "unknown";
  }

  availabilityFromProductHtml(html) {
    const $ = soupFromHtml(html);
    if ($(".button-cart, .check_color_and_size").length) {
      return "in_stock";
    }
    return normalizeAvailability($("body").text());
  }

  idFromUrl(url) {
    const match = url.match(/-(\d+)\/?$/);
    return match ? match[1] : null;
  }

  imageFromCard(card) {
    const image = card.find(".product__photo img").first();
    if (!image.length) {
      return null;
    }
    return absoluteUrl(this.base_url, image.attr("data-src") || image.attr("src"));
  }

  textFrom(card, selector) {
    const element = card.find(selector).first();
    return element.length ? element.text().trim().replace(/\s+/g, " ") : null;
  }

  totalFromSearch($) {
    const text = $(".product_count").first().text().trim();
    const match = text.match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : null;
  }
}
