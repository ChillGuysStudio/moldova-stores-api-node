import { makePrice, makeProduct, makeProductList } from "../models.js";
import { getText as getTextCurl } from "../utils/curlClient.js";
import { getJson, getText } from "../utils/http.js";
import { normalizeAvailability } from "../utils/availability.js";
import { findProductJsonLd } from "../utils/jsonld.js";
import { normalizeCurrency, toFloat } from "../utils/price.js";
import { productFromJsonLd } from "../utils/product.js";
import { saveIdentity } from "../storage/productIdentity.js";

export class SmartAdapter {
  constructor() {
    this.store = "smart";
    this.base_url = "https://www.smart.md";
    this.tenant = "74mosv2covp1tqieoh6lu8edqd";
    this.apiBase = `https://smartmdnew.visely.io/prometheus/api/v3/${this.tenant}`;
  }

  async search(query, { page = 1 } = {}) {
    const offset = Math.max(page - 1, 0) * 40;
    const url =
      `${this.apiBase}/search?q=${encodeURIComponent(query)}&offset=${offset}&count=40` +
      "&includeOutOfStock=false" +
      "&extraFields=variants,brand,model,sku,categories,category_names_ro,additional_attributes,tags";
    const data = await getJson(url);
    return makeProductList({
      store: this.store,
      query,
      page,
      products: (data.products || []).map((item) => this.fromVisely(item)),
      total: data.meta?.total ?? null
    });
  }

  async getById(sourceId) {
    const url =
      `${this.apiBase}/search?q=${encodeURIComponent(sourceId)}&count=1` +
      "&extraFields=variants,brand,model,sku,categories,category_names_ro,additional_attributes,tags";
    const data = await getJson(url);
    for (const item of data.products || []) {
      if (String(item.sku) === String(sourceId) || String(item.id) === String(sourceId)) {
        return this.fromVisely(item);
      }
    }
    throw new Error(`Smart product ${sourceId} not found`);
  }

  async getByUrl(url) {
    const html = await getTextCurl(url, {}, { requireImpersonation: true });
    const product = this.fromProductPage(html, url);
    if (!product) {
      throw new Error(`Smart product URL not parseable: ${url}`);
    }
    await saveIdentity({
      store: this.store,
      source_id: product.source_id,
      sku: product.sku,
      url: product.url,
      name: product.name
    });
    return product;
  }

  fromVisely(item) {
    const nameValue = item.name;
    const name = nameValue && typeof nameValue === "object" ? nameValue.ro : nameValue;
    const prices = item.prices || [];
    const regular = prices.find((price) => price.priceType === "REGULAR") || null;
    const sale = prices.find((price) => price.priceType === "SALE") || null;
    const active = sale || regular || {};
    const categoryRo = item.categoryNames && typeof item.categoryNames === "object" ? item.categoryNames.ro : null;
    const media = item.media || [];
    const image = media[0] && typeof media[0] === "object" ? media[0].url : null;

    const product = makeProduct({
      store: this.store,
      source_id: item.sku !== undefined && item.sku !== null
        ? String(item.sku)
        : item.id !== undefined && item.id !== null
          ? String(item.id)
          : null,
      sku: item.sku !== undefined && item.sku !== null ? String(item.sku) : null,
      name: String(name || item.model || "Unknown product"),
      brand: item.brand ?? null,
      category: Array.isArray(categoryRo) && categoryRo.length ? categoryRo.at(-1) : null,
      url: item.absoluteUrl ?? null,
      image,
      images: image ? [image] : [],
      price: makePrice({
        current: toFloat(active.value),
        old: sale && regular ? toFloat(regular.value) : null,
        currency: normalizeCurrency(active.currency)
      }),
      availability: normalizeAvailability(item.inStock),
      short_description: item.model ?? null,
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

  fromProductPage(html, fallbackUrl) {
    const jsonld = findProductJsonLd(html);
    if (jsonld) {
      return productFromJsonLd(this.store, jsonld, fallbackUrl);
    }

    const item = this.extractMicrodata(html);
    if (!item.name || !item.sku) {
      return null;
    }

    return makeProduct({
      store: this.store,
      source_id: item.sku,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      category: item.category,
      url: item.url || fallbackUrl,
      image: item.images[0] || null,
      images: item.images,
      price: makePrice({
        current: toFloat(item.price),
        old: null,
        currency: normalizeCurrency(item.currency)
      }),
      availability: normalizeAvailability(item.availability),
      short_description: item.description,
      source_type: "mixed",
      raw: {
        meta_title: item.metaTitle,
        og_title: item.ogTitle,
        og_image: item.ogImage
      }
    });
  }

  extractMicrodata(html) {
    const meta = (value, prop = "itemprop") => {
      const pattern = new RegExp(`<meta[^>]+${prop}="${escapeRegex(value)}"[^>]+content="([^"]+)"`, "i");
      return html.match(pattern)?.[1] || null;
    };
    const link = (value) => {
      const pattern = new RegExp(`<link[^>]+itemprop="${escapeRegex(value)}"[^>]+href="([^"]+)"`, "i");
      return html.match(pattern)?.[1] || null;
    };
    const span = (value) => {
      const pattern = new RegExp(`<span[^>]+itemprop="${escapeRegex(value)}"[^>]*>([^<]+)<`, "i");
      return cleanText(html.match(pattern)?.[1] || null);
    };
    const heading = () => cleanText(html.match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1] || null);
    const metaName = (name) => {
      const pattern = new RegExp(`<meta[^>]+name="${escapeRegex(name)}"[^>]+content="([^"]+)"`, "i");
      return html.match(pattern)?.[1] || null;
    };
    const metaProperty = (name) => {
      const pattern = new RegExp(`<meta[^>]+property="${escapeRegex(name)}"[^>]+content="([^"]+)"`, "i");
      return html.match(pattern)?.[1] || null;
    };
    const title = cleanText(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || null);
    const imageMatches = [...html.matchAll(/<meta[^>]+itemprop="image"[^>]+content="([^"]+)"/gi)].map(
      (match) => match[1]
    );
    const breadcrumbMatches = [
      ...html.matchAll(/<span[^>]+itemprop="name"[^>]*>([^<]+)<\/span>/gi)
    ].map((match) => cleanText(match[1])).filter(Boolean);
    const category = breadcrumbMatches.length ? breadcrumbMatches[breadcrumbMatches.length - 1] : null;
    let url = link("url") || metaProperty("og:url");
    if (url && url.startsWith("www.")) {
      url = `https://${url}`;
    }

    return {
      name: meta("name") || heading(),
      sku: span("sku") || span("mpn"),
      brand: meta("brand"),
      description: span("description") || metaName("description"),
      availability: link("availability"),
      currency: meta("priceCurrency"),
      price: meta("price"),
      images: imageMatches.length ? imageMatches : [metaProperty("og:image")].filter(Boolean),
      url,
      category,
      metaTitle: title,
      ogTitle: metaProperty("og:title"),
      ogImage: metaProperty("og:image")
    };
  }
}

function cleanText(value) {
  if (!value) {
    return null;
  }
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
