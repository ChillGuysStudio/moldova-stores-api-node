import test from "node:test";
import assert from "node:assert/strict";
import { makeProduct, makeProductList } from "../src/models.js";
import { clearSearchCache } from "../src/searchCache.js";
import { normalizedSearch } from "../src/routes/products.js";

class FakeAdapter {
  constructor(nativePages) {
    this.store = "fake";
    this.nativePages = nativePages;
    this.calls = [];
  }

  async search(query, { page = 1 } = {}) {
    this.calls.push(page);
    const names = page <= this.nativePages.length ? this.nativePages[page - 1] : [];
    return makeProductList({
      store: this.store,
      query,
      page,
      products: names.map((name) => makeProduct({ store: this.store, source_id: name, name })),
      total: this.nativePages.reduce((sum, items) => sum + items.length, 0)
    });
  }
}

test("normalizedSearch slices native pages", async () => {
  clearSearchCache();
  const adapter = new FakeAdapter([
    Array.from({ length: 33 }, (_, index) => `p${index + 1}`),
    Array.from({ length: 33 }, (_, index) => `p${index + 34}`)
  ]);

  const result = await normalizedSearch(adapter, { q: "iphone", page: 2, pageSize: 20 });

  assert.equal(result.page, 2);
  assert.equal(result.page_size, 20);
  assert.equal(result.total, 66);
  assert.deepEqual(
    result.products.map((product) => product.source_id),
    Array.from({ length: 20 }, (_, index) => `p${index + 21}`)
  );
  assert.deepEqual(adapter.calls, [1, 2]);
});

test("normalizedSearch reuses cached native pages", async () => {
  clearSearchCache();
  const adapter = new FakeAdapter([
    Array.from({ length: 33 }, (_, index) => `p${index + 1}`),
    Array.from({ length: 33 }, (_, index) => `p${index + 34}`)
  ]);

  const first = await normalizedSearch(adapter, { q: "iphone", page: 1, pageSize: 20 });
  const second = await normalizedSearch(adapter, { q: "iphone", page: 2, pageSize: 20 });

  assert.deepEqual(
    first.products.map((product) => product.source_id),
    Array.from({ length: 20 }, (_, index) => `p${index + 1}`)
  );
  assert.deepEqual(
    second.products.map((product) => product.source_id),
    Array.from({ length: 20 }, (_, index) => `p${index + 21}`)
  );
  assert.deepEqual(adapter.calls, [1, 2]);
  clearSearchCache();
});
