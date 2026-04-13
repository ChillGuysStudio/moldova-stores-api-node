import { normalizeAvailability } from "./availability.js";
import { normalizeCurrency, toFloat } from "./price.js";
import { makePrice, makeProduct } from "../models.js";

function brandName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.name ?? null;
  }
  return value ? String(value) : null;
}

function offersValue(value) {
  if (Array.isArray(value)) {
    return value[0] && typeof value[0] === "object" ? value[0] : {};
  }
  return value && typeof value === "object" ? value : {};
}

export function productFromJsonLd(store, data, fallbackUrl = null) {
  const offers = offersValue(data.offers);
  const imagesValue = data.image ?? [];
  const images = (Array.isArray(imagesValue) ? imagesValue : [imagesValue])
    .filter(Boolean)
    .map((image) => String(image));
  const sourceId = data.sku ?? data.mpn ?? null;
  const url = data.url ?? offers.url ?? fallbackUrl ?? null;

  return makeProduct({
    store,
    source_id: sourceId !== null ? String(sourceId) : null,
    sku: data.sku !== undefined && data.sku !== null ? String(data.sku) : null,
    name: String(data.name ?? "Unknown product"),
    brand: brandName(data.brand),
    category: data.category ? String(data.category) : null,
    url: url ? String(url) : null,
    image: images[0] ?? null,
    images,
    price: makePrice({
      current: toFloat(offers.price),
      old: null,
      currency: normalizeCurrency(offers.priceCurrency)
    }),
    availability: normalizeAvailability(offers.availability),
    short_description: data.description ? String(data.description) : null,
    source_type: "json_ld",
    raw: data
  });
}
