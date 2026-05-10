import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BombaAdapter } from "../src/adapters/bomba.js";
import { DarwinAdapter } from "../src/adapters/darwin.js";
import { EnterAdapter } from "../src/adapters/enter.js";
import { MaximumAdapter } from "../src/adapters/maximum.js";
import { SmartAdapter } from "../src/adapters/smart.js";
import { UltraAdapter } from "../src/adapters/ultra.js";
import { soupFromHtml } from "../src/utils/html.js";
import { productFromJsonLd } from "../src/utils/product.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moldova-node-"));
process.env.IDENTITY_DB_BACKEND = "sqlite";
process.env.PRODUCT_IDENTITY_DB = path.join(tempDir, "identity.sqlite3");

test("JSON-LD products use sku as canonical source id without mpn fallback", () => {
  const product = productFromJsonLd("bomba", {
    name: "Demo",
    sku: null,
    mpn: "ARTICLE-123",
    offers: {
      price: 100,
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock"
    }
  });

  assert.equal(product.source_id, null);
  assert.equal(product.sku, null);
});

test("Darwin extracts the canonical numeric product id from Livewire card metadata", () => {
  const $ = soupFromHtml(`
    <div class="product-card product-item">
      <div wire:snapshot='{"data":{"product":[null,{"class":"product","key":166500,"s":"mdl"}]}}'></div>
      <a class="product-link" href="/product.html"></a>
    </div>
  `);

  const card = $(".product-card").first();
  assert.equal(new DarwinAdapter().sourceIdFromCard(card), "166500");
});

test("Smart search items only expose sku as canonical source id", () => {
  const product = new SmartAdapter().fromVisely({
    id: "27164295",
    sku: "222389330",
    name: { ro: "Apple iPhone 15 128GB, Pink" },
    prices: [{ priceType: "REGULAR", value: 15999, currency: "MDL" }],
    categoryNames: { ro: ["Smartphone"] },
    media: [{ url: "https://cdn.example.com/iphone.jpg" }],
    absoluteUrl: "https://www.smart.md/apple-iphone-15-128gb-pink",
    inStock: true
  });

  assert.ok(product);
  assert.equal(product.source_id, "222389330");
  assert.equal(product.sku, "222389330");
});

test("Smart search items without sku are skipped instead of falling back to another id", () => {
  const product = new SmartAdapter().fromVisely({
    id: "27164295",
    name: { ro: "Apple iPhone 15 128GB, Pink" }
  });

  assert.equal(product, null);
});

test("Darwin product page id matches the canonical search id", () => {
  const searchId = "166500";
  const pageProduct = productFromJsonLd("darwin", {
    name: "Apple iPhone 17 Pro Max 1 TB Orange Cosmic Global",
    sku: 166500,
    mpn: 166500,
    offers: {
      price: 41999,
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock"
    }
  });

  assert.equal(pageProduct.source_id, searchId);
});

test("Enter product page id matches the canonical search id", () => {
  const searchProduct = new EnterAdapter().fromSearchItem({
    id: 51382,
    name: "Sticlă de protecție Apple iPhone 12 mini",
    brand: "XProtect",
    url: "https://enter.online/example",
    price: { current_price: 199, old: 249, currency: "MDL" }
  });
  const pageProduct = productFromJsonLd("enter", {
    name: "Sticlă de protecție Apple iPhone 12 mini",
    sku: 51382,
    mpn: 51382,
    offers: {
      price: 199,
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock"
    }
  });

  assert.ok(searchProduct);
  assert.equal(searchProduct.source_id, pageProduct.source_id);
});

test("Maximum keeps the storefront product id for both search and product page fetches", () => {
  const adapter = new MaximumAdapter();
  const $ = soupFromHtml(`
    <div class="js-content product__item">
      <div class="product__item__title">
        <a href="/ro/6744031/">Smartphone Apple iPhone 15 128GB Black MTP03</a>
      </div>
      <div data-id="6744031"></div>
    </div>
  `);

  const searchId = adapter.idFromCard($(".js-content.product__item").first(), "/ro/6744031/");
  const pageProduct = productFromJsonLd("maximum", {
    name: "Smartphone Apple iPhone 15 128GB Black MTP03",
    sku: "169939",
    mpn: "169939",
    offers: {
      url: "https://maximum.md/ro/6744031/",
      price: 14999,
      priceCurrency: "MDL",
      availability: "https://schema.org/OutOfStock"
    }
  });

  assert.equal(searchId, "6744031");
  assert.equal(adapter.idFromUrl("https://maximum.md/ro/6744031/"), "6744031");
  assert.equal(pageProduct.source_id, "169939");
  assert.notEqual(pageProduct.source_id, searchId);
});

test("Smart product page id matches the canonical search id", () => {
  const searchProduct = new SmartAdapter().fromVisely({
    id: "27164295",
    sku: "222389330",
    name: { ro: "Apple iPhone 15 128GB, Pink" },
    prices: [{ priceType: "REGULAR", value: 15999, currency: "MDL" }],
    categoryNames: { ro: ["Smartphone"] },
    media: [{ url: "https://cdn.example.com/iphone.jpg" }],
    absoluteUrl: "https://www.smart.md/apple-iphone-15-128gb-pink",
    inStock: true
  });
  const pageProduct = productFromJsonLd("smart", {
    name: "Apple iPhone 15 128GB, Pink",
    sku: "222389330",
    offers: {
      price: 15999,
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock"
    }
  });

  assert.ok(searchProduct);
  assert.equal(searchProduct.source_id, pageProduct.source_id);
});

test("Bomba product page id matches the canonical search id", () => {
  const $ = soupFromHtml(`
    <div class="product__item" data-id="1154235" data-articol="IPHONE17256GBLAVANDER">
      <a class="name" href="/ro/product/smartphone-apple-iphone-17-256gb-lavander-1154235/" data-ecom_id="1154235">
        Smartphone Apple iPhone 17 / 6.3'' / 8 GB / 256 GB / Lavander
      </a>
    </div>
  `);
  const searchProduct = new BombaAdapter().parseSearchCards($).at(0);
  const pageProduct = productFromJsonLd("bomba", {
    name: "Smartphone Apple iPhone 17 / 6.3'' / 8 GB / 256 GB / Lavander",
    sku: "1154235",
    mpn: "IPHONE17256GBLAVANDER",
    offers: {
      price: 20199,
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock"
    }
  });

  assert.ok(searchProduct);
  assert.equal(searchProduct.source_id, pageProduct.source_id);
});

test("Ultra product page id matches the canonical search id", () => {
  const $ = soupFromHtml(`
    <div class="product-card" data-code="239828">
      <a class="product-card__link" href="/product/iphone-17-pro-max-2tb-cosmic-orange-md"></a>
      <div class="product-card__title">Smartphone Apple iPhone 17 Pro Max, 12 GB / 2048GB</div>
    </div>
  `);
  const searchProduct = new UltraAdapter().parseCategoryCards($).at(0);
  const pageProduct = productFromJsonLd("ultra", {
    name: "Smartphone Apple iPhone 17 Pro Max, 12 GB / 2048GB",
    sku: "239828",
    mpn: "MG004ZD/A",
    offers: {
      price: 48699,
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock"
    }
  });

  assert.ok(searchProduct);
  assert.equal(searchProduct.source_id, pageProduct.source_id);
});
