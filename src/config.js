export const STORE_CAPABILITIES = {
  smart: {
    store: "smart",
    name: "Smart.md",
    base_url: "https://www.smart.md",
    supports_search: true,
    supports_url_fetch: true,
    supports_id_fetch: "direct",
    notes: "Uses Visely catalog/search API."
  },
  bomba: {
    store: "bomba",
    name: "Bomba.md",
    base_url: "https://bomba.md",
    supports_search: true,
    supports_url_fetch: true,
    supports_id_fetch: "direct",
    notes: "Uses curl because regular HTTP clients are blocked by Cloudflare."
  },
  maximum: {
    store: "maximum",
    name: "Maximum.md",
    base_url: "https://maximum.md",
    supports_search: true,
    supports_url_fetch: true,
    supports_id_fetch: "direct",
    notes: "Uses the Romanian PJAX search HTML fragment for search and compare-cookie product JSON for ID lookup."
  },
  xstore: {
    store: "xstore",
    name: "Xstore.md",
    base_url: "https://xstore.md",
    supports_search: true,
    supports_url_fetch: true,
    supports_id_fetch: "search_resolved",
    notes: "Uses full HTML search cards with data-id metadata; cold ID lookup resolves through an exact search card."
  },
  enter: {
    store: "enter",
    name: "Enter.online",
    base_url: "https://enter.online",
    supports_search: true,
    supports_url_fetch: true,
    supports_id_fetch: "cached_or_resolved",
    notes: "Cold numeric ID lookup is unreliable; search/by-url fills the resolver cache."
  },
  darwin: {
    store: "darwin",
    name: "Darwin.md",
    base_url: "https://darwin.md",
    supports_search: true,
    supports_url_fetch: true,
    supports_id_fetch: "cached_or_resolved",
    notes: "Uses the Romanian HTML search page; cold numeric ID lookup is unreliable, search/by-url fills the resolver cache."
  }
};
