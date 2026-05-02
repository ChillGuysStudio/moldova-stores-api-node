import test from "node:test";
import assert from "node:assert/strict";
import { resolveCategory } from "../src/categories.js";
import { makeProduct, makeProductList } from "../src/models.js";
import { clearSearchCache } from "../src/searchCache.js";
import { normalizedSearch } from "../src/routes/products.js";

class FakeAdapter {
  constructor(nativePages) {
    this.store = "fake";
    this.nativePages = nativePages;
    this.calls = [];
  }

  async search(query, { page = 1, category = null } = {}) {
    this.calls.push({ page, category: category?.id ?? null });
    const names = page <= this.nativePages.length ? this.nativePages[page - 1] : [];
    return makeProductList({
      store: this.store,
      query,
      category: category?.id ?? null,
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
  assert.deepEqual(adapter.calls, [
    { page: 1, category: null },
    { page: 2, category: null }
  ]);
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
  assert.deepEqual(adapter.calls, [
    { page: 1, category: null },
    { page: 2, category: null }
  ]);
  clearSearchCache();
});

test("normalizedSearch keeps category-specific native cache entries", async () => {
  clearSearchCache();
  const adapter = new FakeAdapter([
    Array.from({ length: 25 }, (_, index) => `p${index + 1}`)
  ]);
  const category = resolveCategory("phones");

  const result = await normalizedSearch(adapter, { q: "iphone", page: 1, pageSize: 20, category });
  const uncategorized = await normalizedSearch(adapter, { q: "iphone", page: 1, pageSize: 20 });

  assert.equal(result.category, "phones");
  assert.equal(uncategorized.category, null);
  assert.deepEqual(adapter.calls, [
    { page: 1, category: "phones" },
    { page: 1, category: null }
  ]);
  clearSearchCache();
});
