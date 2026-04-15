import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiDocument } from "../src/openapi.js";

test("openapi includes admin endpoints by default", () => {
  const document = buildOpenApiDocument("http://127.0.0.1:8000");

  assert.ok(document.paths["/admin/api-keys"]);
  assert.ok(document.paths["/admin/api-keys/{id}/revoke"]);
  assert.equal(document.tags.some((tag) => tag.name === "Admin"), true);
});

test("openapi can omit admin endpoints for production docs", () => {
  const document = buildOpenApiDocument("https://api.example.com", {
    includeAdmin: false
  });

  assert.equal(document.paths["/admin/api-keys"], undefined);
  assert.equal(document.paths["/admin/api-keys/{id}/revoke"], undefined);
  assert.equal(document.tags.some((tag) => tag.name === "Admin"), false);
  assert.equal(document.components.schemas.ApiKey, undefined);
});
