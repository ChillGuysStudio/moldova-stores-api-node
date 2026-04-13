import { ProductNotResolvedError } from "../errors.js";
import { makePrice, makeProduct, makeProductList } from "../models.js";
import { getIdentity, saveIdentity } from "../storage/productIdentity.js";
import { getText } from "../utils/http.js";
import { absoluteUrl, soupFromHtml } from "../utils/html.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";

export class DarwinAdapter {
  constructor() {
    this.store = "darwin";
    this.base_url = "https://darwin.md";
  }

  async search(query, { page = 1 } = {}) {
    const html = await getText(`${this.base_url}/cautare?keywords=${encodeURIComponent(query)}&page=${page}`);
    const $ = soupFromHtml(html);
    return makeProductList({
      store: this.store,
      query,
      page,
      products: this.parseSearchCards($),
      total: this.totalFromSearch($)
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
      throw new Error(`Darwin product URL not parseable: ${url}`);
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
      const sourceId = ga4Item.item_id;
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
        availability: "unknown",
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

  totalFromSearch($) {
    const text = $.root().text().replace(/\s+/g, " ");
    const match = text.match(/Produse\s+g[aă]site:\s*(\d[\d\s]*)/i);
    return match ? Number.parseInt(match[1].replaceAll(" ", ""), 10) : null;
  }
}
