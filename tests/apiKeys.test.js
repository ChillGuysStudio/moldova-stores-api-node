import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApiKey, listApiKeys, revokeApiKey } from "../src/storage/apiKeys.js";
import { initDb } from "../src/storage/db.js";
import { requireAdminToken, requireApiKey } from "../src/middleware/auth.js";

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

function makeRequest(token) {
  return {
    path: "/stores",
    ip: "127.0.0.1",
    get(name) {
      return name.toLowerCase() === "authorization" && token ? `Bearer ${token}` : undefined;
    }
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

async function runMiddleware(middleware, req) {
  const res = makeResponse();
  let nextCalled = false;
  let nextError = null;
  await middleware(req, res, (error) => {
    nextCalled = true;
    nextError = error ?? null;
  });
  return { res, nextCalled, nextError, req };
}

test("admin token can create and revoke client API keys", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "moldova-node-auth-"));
  const dbPath = path.join(tempDir, "identity.sqlite3");

  await withEnv(
    {
      IDENTITY_DB_BACKEND: "sqlite",
      PRODUCT_IDENTITY_DB: dbPath,
      ADMIN_TOKEN: "admin-secret"
    },
    async () => {
      await initDb();

      const adminDenied = await runMiddleware(requireAdminToken, makeRequest(null));
      assert.equal(adminDenied.res.statusCode, 401);

      const adminAllowed = await runMiddleware(requireAdminToken, makeRequest("admin-secret"));
      assert.equal(adminAllowed.nextCalled, true);
      assert.equal(adminAllowed.nextError, null);

      const adminApiAllowed = await runMiddleware(requireApiKey, makeRequest("admin-secret"));
      assert.equal(adminApiAllowed.nextCalled, true);
      assert.equal(adminApiAllowed.nextError, null);
      assert.equal(adminApiAllowed.req.apiKey.role, "admin");

      const created = await createApiKey({ name: "main-backend-prod" });
      assert.equal(created.name, "main-backend-prod");
      assert.match(created.api_key, /^mspa_/);
      assert.match(created.key_prefix, /^mspa_/);

      const apiAllowed = await runMiddleware(requireApiKey, makeRequest(created.api_key));
      assert.equal(apiAllowed.nextCalled, true);
      assert.equal(apiAllowed.nextError, null);
      assert.equal(apiAllowed.req.apiKey.id, created.id);
      assert.equal(apiAllowed.req.apiKey.role, "client");

      const listed = await listApiKeys();
      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, created.id);
      assert.ok(listed[0].last_used_at);

      const revoked = await revokeApiKey(created.id);
      assert.ok(revoked);
      assert.ok(revoked.revoked_at);

      const apiDenied = await runMiddleware(requireApiKey, makeRequest(created.api_key));
      assert.equal(apiDenied.res.statusCode, 401);
      assert.deepEqual(apiDenied.res.payload, { detail: "Invalid or revoked API key" });
    }
  );
});
