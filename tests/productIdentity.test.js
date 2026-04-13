import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDatabaseUrl, getIdentityDbBackend } from "../src/storage/db.js";
import { getIdentity, saveIdentity } from "../src/storage/productIdentity.js";

function withEnv(entries, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("sqlite identity profile persists mapping", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moldova-node-"));
  const dbPath = path.join(tempDir, "identity.sqlite3");

  await withEnv(
    {
      IDENTITY_DB_BACKEND: "sqlite",
      PRODUCT_IDENTITY_DB: dbPath
    },
    async () => {
      await saveIdentity({
        store: "enter",
        source_id: 263,
        sku: 263,
        url: "https://enter.online/old",
        name: "Old"
      });
      await saveIdentity({
        store: "enter",
        source_id: 263,
        sku: 263,
        url: "https://enter.online/new",
        name: "New"
      });
      const identity = await getIdentity("enter", 263);
      assert.ok(identity);
      assert.equal(identity.store, "enter");
      assert.equal(identity.source_id, "263");
      assert.equal(identity.sku, "263");
      assert.equal(identity.url, "https://enter.online/new");
      assert.equal(identity.name, "New");
    }
  );
});

test("sqlite identity profile does not overwrite with nulls", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moldova-node-"));
  const dbPath = path.join(tempDir, "identity.sqlite3");

  await withEnv(
    {
      IDENTITY_DB_BACKEND: "sqlite",
      PRODUCT_IDENTITY_DB: dbPath
    },
    async () => {
      await saveIdentity({
        store: "darwin",
        source_id: "sku-1",
        sku: "sku-1",
        url: "https://darwin.md/product",
        name: "Product"
      });
      await saveIdentity({
        store: "darwin",
        source_id: "sku-1",
        sku: null,
        url: null,
        name: null
      });
      const identity = await getIdentity("darwin", "sku-1");
      assert.ok(identity);
      assert.equal(identity.sku, "sku-1");
      assert.equal(identity.url, "https://darwin.md/product");
      assert.equal(identity.name, "Product");
    }
  );
});

test("postgres profile requires database url", () => {
  process.env.IDENTITY_DB_BACKEND = "postgres";
  delete process.env.DATABASE_URL;
  assert.equal(getIdentityDbBackend(), "postgres");
  assert.throws(() => getDatabaseUrl(), /DATABASE_URL is required/);
});

test("missing identity profile fails clearly", () => {
  delete process.env.IDENTITY_DB_BACKEND;
  assert.throws(() => getIdentityDbBackend(), /IDENTITY_DB_BACKEND is required/);
});

test("invalid identity profile fails clearly", () => {
  process.env.IDENTITY_DB_BACKEND = "redis";
  assert.throws(() => getIdentityDbBackend(), /IDENTITY_DB_BACKEND/);
});
