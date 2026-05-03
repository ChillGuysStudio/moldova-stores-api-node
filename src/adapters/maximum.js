import { makePrice, makeProduct, makeProductList } from "../models.js";
import { categoryForStore } from "../categories.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getJson, getText } from "../utils/http.js";
import { absoluteUrl, soupFromHtml } from "../utils/html.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { normalizeAvailability } from "../utils/availability.js";
import { normalizeCurrency, toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class MaximumAdapter {
  constructor() {
    this.store = "maximum";
    this.base_url = "https://maximum.md";
  }

  async search(query, { page = 1, category = null, sort = null } = {}) {
    const storeCategory = categoryForStore(category, this.store);
    const url = storeCategory
      ? this.categorySearchUrl(storeCategory.path, query, page, sort)
      : this.searchUrl(query, page, sort);
    const html = await getText(url, {
      headers: {
        accept: "text/html, */*; q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "x-pjax": "true",
        "x-pjax-container": "#js-pjax-container"
      }
    });
    const $ = soupFromHtml(html);
    const pageCategory = storeCategory ? this.categoryFromSearchPage($) : null;
    return makeProductList({
      store: this.store,
      query,
      category: category?.id ?? null,
      sort,
      page,
      products: this.parseSearchCards($, pageCategory),
      total: this.totalFromSearch($)
    });
  }

  searchUrl(query, page, sort) {
    const params = new URLSearchParams({ query });
    this.applySort(params, sort);
    return `${this.base_url}/ro/search/${page}?${params.toString()}`;
  }

  categorySearchUrl(path, query, page, sort) {
    const cleanPath = path.endsWith("/") ? path : `${path}/`;
    const pageSegment = page > 1 ? `${page}/` : "";
    const params = new URLSearchParams({ query });
    this.applySort(params, sort);
    return `${this.base_url}${cleanPath}${pageSegment}?${params.toString()}`;
  }

  applySort(params, sort) {
    const value = {
      price_asc: "cheaper",
      price_desc: "expensive",
      popularity: "popular"
    }[sort];
    if (value) {
      params.set("sort-type", value);
    }
  }

  async getById(sourceId) {
    const data = await getJson(`${this.base_url}/ro/get_compare_products`, {
      headers: {
        cookie: `compare_products=${sourceId}`
      }
    });
    const products = data.products || [];
    if (!products.length) {
      throw new Error(`Maximum product ${sourceId} not found`);
    }
    const product = this.fromCompareItem(products[0]);
    const identity = await getIdentity(this.store, sourceId);
    if (identity) {
      product.url = product.url || identity.url || null;
      product.sku = product.sku || identity.sku || null;
      product.name = product.name || identity.name || "Unknown product";
    }
    if (product.availability === "unknown" && product.url) {
      try {
        const html = await getText(product.url);
        product.availability = this.availabilityFromProductHtml(html);
        product.category = product.category || this.categoryFromBreadcrumbs(html);
      } catch {
        product.availability = "unknown";
      }
    }
    return product;
  }

  async getByUrl(url) {
    const html = await getText(url);
    const jsonld = findProductJsonLd(html);
    if (!jsonld) {
      throw new Error(`Maximum product URL not parseable: ${url}`);
    }
    const product = productFromJsonLd(this.store, jsonld, url);
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
    $(".js-content.product__item").each((_, element) => {
      const card = $(element);
      const title = card.find(".product__item__title a").first();
      const sourceId = this.idFromCard(card, title.attr("href"));
      if (!sourceId || seen.has(sourceId)) {
        return;
      }
      seen.add(sourceId);
      const imageEl = card.find(".product__item__image img").first();
      const image = imageEl.length
        ? absoluteUrl(this.base_url, imageEl.attr("data-src") || imageEl.attr("src"))
        : null;
      const url = absoluteUrl(this.base_url, title.attr("href"));
      const product = makeProduct({
        store: this.store,
        source_id: sourceId,
        sku: sourceId,
        name: title.length ? title.text().trim().replace(/\s+/g, " ") : "Unknown product",
        category: fallbackCategory,
        url,
        image,
        images: image ? [image] : [],
        price: makePrice({
          current: this.priceFromText(card.find(".product__item__price-current").first()),
          old: this.priceFromText(card.find(".product__item__price-old").first()),
          currency: "MDL"
        }),
        availability: this.availabilityFromCard(card),
        short_description: this.descriptionFromCard(card),
        source_type: "html_card",
        raw: { url }
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

  categoryFromSearchPage($) {
    const heading = $("h1").first().text().trim().replace(/\s+/g, " ");
    if (heading && !/rezultatul c[ăa]ut[ăa]rii/i.test(heading)) {
      return heading;
    }
    const values = $(".breadcrumbs a, .breadcrumb a")
      .map((_, element) => $(element).text().trim().replace(/\s+/g, " "))
      .get()
      .filter(Boolean)
      .filter((value) => !/internet-magazin|maximum/i.test(value));
    return values.length ? values.at(-1) : null;
  }

  idFromCard(card, href) {
    const element = card.find("[data-product], [data-id]").first();
    const productId = element.attr("data-product") || element.attr("data-id");
    if (productId) {
      return String(productId);
    }
    const match = href?.match(/\/(\d+)\/?$/);
    return match ? match[1] : null;
  }

  priceFromText(element) {
    if (!element?.length) {
      return null;
    }
    const match = element.text().match(/\d[\d\s.,]*/);
    return match ? toFloat(match[0]) : null;
  }

  descriptionFromCard(card) {
    const clone = card.find(".product-item-description").first().clone();
    if (!clone.length) {
      return null;
    }
    clone.find(".product-item-description-code").remove();
    const text = clone.text().trim().replace(/\s+/g, " ");
    return text || null;
  }

  totalFromSearch($) {
    const raw = $("#js_filter_total_products").attr("data-count");
    const total = toFloat(raw);
    return total !== null ? Number.parseInt(String(total), 10) : null;
  }

  fromCompareItem(item) {
    const features = item.features || {};
    let title = item.title;
    if (title && typeof title === "object") {
      title = title.ro || Object.values(title)[0] || null;
    }
    const product = makeProduct({
      store: this.store,
      source_id: item._id !== undefined && item._id !== null ? String(item._id) : null,
      sku: item._id !== undefined && item._id !== null ? String(item._id) : null,
      name: String(title || "Unknown product"),
      image: item.image ?? null,
      images: item.image ? [item.image] : [],
      price: makePrice({
        current: toFloat(item.price),
        old: toFloat(features["2"]?.value),
        currency: normalizeCurrency(item.currency)
      }),
      availability: this.availabilityFromCompareItem(item),
      source_type: "cookie_based_json",
      raw: item
    });
    void saveIdentity({
      store: this.store,
      source_id: product.source_id,
      sku: product.sku,
      name: product.name
    });
    return product;
  }

  availabilityFromCard(card) {
    if (card.find(".js-add-to-cart.product__item__btn, .product__item__btn[data-href]").length) {
      return "in_stock";
    }
    if (card.find(".product_not_in_shop, .not_in_shops").length) {
      return "out_of_stock";
    }
    return "unknown";
  }

  availabilityFromCompareItem(item) {
    const candidates = [
      item.in_stock,
      item.inStock,
      item.available,
      item.availability,
      item.stock
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
    if ($(".js-add-to-cart.product__item__btn, .product__item__btn[data-href], .js-add-to-cart").length) {
      return "in_stock";
    }
    return normalizeAvailability($("body").text());
  }

  categoryFromBreadcrumbs(html) {
    const $ = soupFromHtml(html);
    const values = $(".breadcrumbs a, .breadcrumb a")
      .map((_, element) => $(element).text().trim().replace(/\s+/g, " "))
      .get()
      .filter(Boolean)
      .filter((value) => !/internet-magazin|maximum/i.test(value));
    return values.length ? values.at(-1) : null;
  }
}
