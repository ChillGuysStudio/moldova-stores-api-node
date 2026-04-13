import { makePrice, makeProduct, makeProductList } from "../models.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getText } from "../utils/http.js";
import { absoluteUrl, soupFromHtml } from "../utils/html.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class XstoreAdapter {
  constructor() {
    this.store = "xstore";
    this.base_url = "https://xstore.md";
  }

  async search(query, { page = 1 } = {}) {
    let url = `${this.base_url}/search?search=${encodeURIComponent(query)}`;
    if (page > 1) {
      url += `&page=${page}`;
    }
    const html = await getText(url);
    const $ = soupFromHtml(html);
    return makeProductList({
      store: this.store,
      query,
      page,
      products: this.parseCards($),
      total: this.totalFromSearch($)
    });
  }

  async getById(sourceId) {
    const identity = await getIdentity(this.store, sourceId);
    if (identity?.url && !identity.url.includes("javascript:")) {
      return this.getByUrl(identity.url);
    }
    const results = await this.search(String(sourceId));
    const exact = results.products.find(
      (item) => item.source_id === String(sourceId) && item.url
    );
    if (!exact) {
      throw new Error(`Xstore product ${sourceId} not found`);
    }
    return this.getByUrl(exact.url);
  }

  async getByUrl(url) {
    const html = await getText(url);
    const jsonld = findProductJsonLd(html);
    if (!jsonld) {
      throw new Error(`Xstore product URL not parseable: ${url}`);
    }
    const product = productFromJsonLd(this.store, jsonld, url);
    await saveIdentity({
      store: this.store,
      source_id: product.source_id,
      sku: product.sku,
      url: product.url || url,
      name: product.name
    });
    return product;
  }

  parseCards($) {
    const products = [];
    const seen = new Set();
    $("[data-id][data-p='item']").each((_, element) => {
      const data = $(element);
      const sourceId = data.attr("data-id");
      if (!sourceId || seen.has(sourceId)) {
        return;
      }
      seen.add(sourceId);
      let card = data.closest("figure.card-product");
      if (!card.length) {
        card = data.parent();
      }
      const link = card.find("a.img-wrap[href], a.xp-title[href]").first();
      const url = absoluteUrl(this.base_url, link.attr("href"));
      const imageEl = card.find("img").first();
      const image = absoluteUrl(this.base_url, imageEl.attr("data-src") || imageEl.attr("src"));
      const product = makeProduct({
        store: this.store,
        source_id: sourceId,
        sku: sourceId,
        name: data.attr("data-name") || link.text().trim().replace(/\s+/g, " ") || "Unknown product",
        brand: data.attr("data-brand") || null,
        category: data.attr("data-category") || null,
        url,
        image,
        images: image ? [image] : [],
        price: makePrice({
          current: toFloat(data.attr("data-price")),
          old: this.priceFromCard(card, ".x-old"),
          currency: "MDL"
        }),
        availability: card.find(".add_xcart").length ? "in_stock" : "unknown",
        short_description: this.textFromCard(card, ".xp-attr"),
        source_type: "html_card",
        raw: Object.fromEntries(
          Object.entries(element.attribs || {}).filter(([key]) => key.startsWith("data-"))
        )
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

  priceFromCard(card, selector) {
    const text = this.textFromCard(card, selector);
    if (!text) {
      return null;
    }
    const match = text.match(/\d[\d\s.,]*/);
    return match ? toFloat(match[0]) : null;
  }

  textFromCard(card, selector) {
    const element = card.find(selector).first();
    if (!element.length) {
      return null;
    }
    const text = element.text().trim().replace(/\s+/g, " ");
    return text || null;
  }

  totalFromSearch($) {
    const match = $.root().text().replace(/\s+/g, " ").match(/\((\d[\d\s]*)\s+produse\)/);
    return match ? Number.parseInt(match[1].replaceAll(" ", ""), 10) : null;
  }
}
