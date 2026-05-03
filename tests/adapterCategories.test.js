import test from "node:test";
import assert from "node:assert/strict";
import { BombaAdapter } from "../src/adapters/bomba.js";
import { MaximumAdapter } from "../src/adapters/maximum.js";
import { UltraAdapter } from "../src/adapters/ultra.js";
import { soupFromHtml } from "../src/utils/html.js";

test("Bomba extracts the selected store category label from search filters", () => {
  const $ = soupFromHtml(`
    <div class="checkbox__item">
      <input name="category[686094]" value="686094">
      <span>Smartphone (34)</span>
    </div>
  `);

  assert.equal(new BombaAdapter().categoryFromSearchFilters($, 686094), "Smartphone");
});

test("Maximum uses the category search page heading as product category", () => {
  const $ = soupFromHtml(`
    <nav class="breadcrumbs"><a>Internet-magazin MAXIMUM</a><a>Telefoane si comunicatii</a></nav>
    <h1>Smartphone-uri</h1>
  `);

  assert.equal(new MaximumAdapter().categoryFromSearchPage($), "Smartphone-uri");
});

test("Ultra uses the category search page heading as product category", () => {
  const $ = soupFromHtml(`
    <nav class="breadcrumbs"><a>Telefoane</a></nav>
    <h1>Smartphone</h1>
  `);

  assert.equal(new UltraAdapter().categoryFromSearchPage($), "Smartphone");
});
