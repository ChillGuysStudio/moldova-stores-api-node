export const SORT_OPTIONS = ["price_asc", "price_desc", "popularity"];

const SORT_ALIASES = new Map([
  ["price_asc", "price_asc"],
  ["lowest", "price_asc"],
  ["lowest_first", "price_asc"],
  ["low_to_high", "price_asc"],
  ["cheapest", "price_asc"],
  ["cheap", "price_asc"],
  ["asc", "price_asc"],
  ["price_desc", "price_desc"],
  ["highest", "price_desc"],
  ["highest_first", "price_desc"],
  ["high_to_low", "price_desc"],
  ["expensive", "price_desc"],
  ["desc", "price_desc"],
  ["popularity", "popularity"],
  ["popular", "popularity"]
]);

export function resolveSort(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const normalized = SORT_ALIASES.get(String(value).trim().toLowerCase().replace(/-/g, "_"));
  if (!normalized) {
    throw new Error(`Unsupported sort: ${value}`);
  }
  return normalized;
}
