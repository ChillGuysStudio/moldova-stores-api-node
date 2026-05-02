import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAvailability } from "../src/utils/availability.js";
import { normalizeCurrency, toFloat } from "../src/utils/price.js";

test("toFloat parses common price strings", () => {
  assert.equal(toFloat("13 369.00"), 13369);
  assert.equal(toFloat("28399,50"), 28399.5);
});

test("normalizeCurrency maps lei to MDL", () => {
  assert.equal(normalizeCurrency("lei"), "MDL");
  assert.equal(normalizeCurrency("MDL"), "MDL");
});

test("normalizeAvailability handles schema urls", () => {
  assert.equal(normalizeAvailability("https://schema.org/InStock"), "in_stock");
  assert.equal(normalizeAvailability("https://schema.org/OutOfStock"), "out_of_stock");
});

test("normalizeAvailability handles Romanian store labels", () => {
  assert.equal(normalizeAvailability("În stoc"), "in_stock");
  assert.equal(normalizeAvailability("Disponibil"), "in_stock");
  assert.equal(normalizeAvailability("Indisponibil"), "out_of_stock");
  assert.equal(normalizeAvailability("Stoc epuizat"), "out_of_stock");
  assert.equal(normalizeAvailability("Precomandă"), "preorder");
});
