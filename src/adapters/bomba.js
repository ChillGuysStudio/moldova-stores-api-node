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

  async search(query, { page = 1, category = null, sort = null } = {}) {
    const storeCategory = categoryForStore(category, this.store);
    const params = new URLSearchParams({ query });
    if (page > 1 || storeCategory || sort) {
      params.set("page", String(page));
    }
    if (storeCategory) {
      params.set("stock", "1");
      params.set(`category[${storeCategory.id}]`, String(storeCategory.id));
      params.set("limit", "64");
    }
    this.applySort(params, sort, storeCategory);
    const url = `${this.base_url}/ro/cautare/?${params.toString()}`;
    const html = await getText(url, {}, { requireImpersonation: true });
    const $ = soupFromHtml(html);
    const pageCategory = storeCategory ? this.categoryFromSearchFilters($, storeCategory.id) : null;
    return makeProductList({
      store: this.store,
      query,
      category: category?.id ?? null,
      sort,
      page,
      products: await this.enrichAvailability(this.parseSearchCards($, pageCategory)),
      total: this.totalFromSearch($)
    });
  }

  applySort(params, sort, storeCategory) {
    const value = {
      price_asc: "0",
      price_desc: "1",
      popularity: "5"
    }[sort];
    if (value) {
      params.set("sort", value);
      return;
    }
    if (storeCategory) {
      params.set("sort", "7");
    }
  }

  async getById(sourceId) {
    const data = await postJson(
      `${this.base_url}/product/find_one/`,
      { lang: "ro", id: sourceId },
      {},
      { requireImpersonation: true }
    );
    if (data.id === undefined || data.id === null) {
      throw new Error(`Bomba product ${sourceId} is missing canonical product ID`);
    }
    const product = makeProduct({
      store: this.store,
      source_id: String(data.id),
      sku: String(data.id),
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
    if ((product.availability === "unknown" || !product.category) && identity?.url) {
      const pageProduct = await this.getByUrl(identity.url);
      product.url = product.url || pageProduct.url;
      product.image = product.image || pageProduct.image;
      product.images = product.images.length ? product.images : pageProduct.images;
      product.category = product.category || pageProduct.category;
      if (product.availability === "unknown") {
        product.availability = pageProduct.availability;
      }
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
    const u = new URL(url);
    u.pathname = u.pathname.replace(/^\/ru\//, "/ro/");
    url = u.toString();
    const html = await getText(url, {}, { requireImpersonation: true });
    const jsonld = findProductJsonLd(html);
    if (!jsonld) {
      throw new Error(`Bomba product URL not parseable: ${url}`);
    }
    const product = productFromJsonLd(this.store, jsonld, url);
    product.source_type = "json_ld";
    if (!product.source_id) {
      throw new Error(`Bomba product URL is missing canonical product ID: ${url}`);
    }
    product.sku = product.sku || product.source_id;
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

  parseSearchCards($, fallbackCategory = null) {
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
        category: link.attr("data-ecom_category") || fallbackCategory,
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

  categoryFromSearchFilters($, storeCategoryId) {
    const input = $(`input[name="category[${storeCategoryId}]"]`).first();
    if (!input.length) {
      return null;
    }
    const text = input.closest("label, .checkbox__item, li, div").text().trim().replace(/\s+/g, " ");
    return text.replace(/\s*\(\d+\)\s*$/, "") || null;
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

  categoryFromBreadcrumbs(html) {
    const $ = soupFromHtml(html);
    const values = $(".breadcrumbs a, .header__breadcrumbs a")
      .map((_, element) => $(element).text().trim().replace(/\s+/g, " "))
      .get()
      .filter(Boolean)
      .filter((value) => !/^acasa$/i.test(value));
    return values.length ? values.at(-1) : null;
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
