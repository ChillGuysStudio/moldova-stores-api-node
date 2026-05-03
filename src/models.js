export const HOST_TO_STORE = {
  "bomba.md": "bomba",
  "www.bomba.md": "bomba",
  "smart.md": "smart",
  "www.smart.md": "smart",
  "enter.online": "enter",
  "www.enter.online": "enter",
  "darwin.md": "darwin",
  "www.darwin.md": "darwin",
  "maximum.md": "maximum",
  "www.maximum.md": "maximum",
  "ultra.md": "ultra",
  "www.ultra.md": "ultra"
};

export function makePrice(overrides = {}) {
  return {
    current: null,
    old: null,
    currency: "MDL",
    ...overrides
  };
}

export function makeProduct(overrides = {}) {
  return {
    store: "",
    source_id: null,
    sku: null,
    name: "Unknown product",
    brand: null,
    category: null,
    url: null,
    image: null,
    images: [],
    price: makePrice(),
    availability: "unknown",
    short_description: null,
    source_type: "mixed",
    raw: {},
    ...overrides
  };
}

export function makeProductList(overrides = {}) {
  return {
    store: "",
    query: "",
    category: null,
    sort: null,
    page: 1,
    page_size: null,
    products: [],
    total: null,
    ...overrides
  };
}

export function makeMultiStoreProductSearch(overrides = {}) {
  return {
    query: "",
    category: null,
    sort: null,
    page: 1,
    page_size: null,
    stores: [],
    results: {},
    errors: {},
    ...overrides
  };
}

export function makeStoreSearchError(store, message) {
  return { store, message };
}
