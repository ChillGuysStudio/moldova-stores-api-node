import test from "node:test";
import assert from "node:assert/strict";
import { makeProduct, makeProductList } from "../src/models.js";
import { cachedNativeSearch, cachedProductByUrl, clearSearchCache } from "../src/searchCache.js";

class FakeAdapter {
  constructor() {
    this.store = "enter";
    this.searchCalls = 0;
    this.byUrlCalls = 0;
  }

  async search(query, { page = 1 } = {}) {
    this.searchCalls += 1;
    return makeProductList({
      store: this.store,
      query,
      page,
      products: [
        makeProduct({
          store: this.store,
          source_id: "123",
          name: "Apple iPhone 15 128GB",
          url: "https://enter.online/product/123/",
          price: { current: 13999, old: 14999, currency: "MDL" }
        })
      ],
      total: 1
    });
  }

  async getByUrl(url) {
    this.byUrlCalls += 1;
    return makeProduct({
      store: this.store,
      source_id: "123",
      name: "Apple iPhone 15 128GB Detailed",
      url,
      price: { current: 13999, old: 14999, currency: "MDL" }
    });
  }
}

test("by-url reuses product cached from search results", async () => {
  clearSearchCache();
  const adapter = new FakeAdapter();

  await cachedNativeSearch(adapter, { query: "iphone", page: 1 });
  const product = await cachedProductByUrl(adapter, "https://enter.online/product/123?utm=campaign#details");

  assert.equal(adapter.searchCalls, 1);
  assert.equal(adapter.byUrlCalls, 0);
  assert.equal(product.scrape_source, "search");
  assert.equal(product.name, "Apple iPhone 15 128GB");
  clearSearchCache();
});

test("by-url cold miss scrapes detail and caches the result", async () => {
  clearSearchCache();
  const adapter = new FakeAdapter();

  const first = await cachedProductByUrl(adapter, "https://enter.online/product/123");
  const second = await cachedProductByUrl(adapter, "https://enter.online/product/123/");

  assert.equal(adapter.byUrlCalls, 1);
  assert.equal(first.scrape_source, "detail");
  assert.equal(second.scrape_source, "detail");
  assert.equal(second.name, "Apple iPhone 15 128GB Detailed");
  clearSearchCache();
});
