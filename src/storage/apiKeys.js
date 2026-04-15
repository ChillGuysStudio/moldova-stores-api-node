import crypto from "node:crypto";
import { connectPostgres, connectSqlite, getIdentityDbBackend, initDb } from "./db.js";
import { generateApiKeyValue, hashApiKey, makeKeyPrefix } from "../auth/apiKeys.js";

function normalizeRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    name: String(row.name),
    key_prefix: String(row.key_prefix),
    created_at: row.created_at ?? null,
    last_used_at: row.last_used_at ?? null,
    revoked_at: row.revoked_at ?? null
  };
}

export async function createApiKey({ name }) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) {
    throw new Error("API key name is required");
  }

  const rawKey = generateApiKeyValue();
  const id = crypto.randomUUID();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = makeKeyPrefix(rawKey);

  await initDb();
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    const result = await pool.query(
      `
        INSERT INTO api_key (id, name, key_hash, key_prefix)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, key_prefix, created_at, last_used_at, revoked_at
      `,
      [id, normalizedName, keyHash, keyPrefix]
    );
    return {
      ...normalizeRow(result.rows[0]),
      api_key: rawKey
    };
  }

  const db = await connectSqlite();
  await db.run(
    `
      INSERT INTO api_key (id, name, key_hash, key_prefix)
      VALUES (?, ?, ?, ?)
    `,
    [id, normalizedName, keyHash, keyPrefix]
  );
  const row = await db.get(
    `
      SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
      FROM api_key
      WHERE id = ?
    `,
    [id]
  );
  return {
    ...normalizeRow(row),
    api_key: rawKey
  };
}

export async function listApiKeys() {
  await initDb();
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    const result = await pool.query(
      `
        SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
        FROM api_key
        ORDER BY created_at DESC, name ASC
      `
    );
    return result.rows.map(normalizeRow);
  }

  const db = await connectSqlite();
  const rows = await db.all(
    `
      SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
      FROM api_key
      ORDER BY created_at DESC, name ASC
    `
  );
  return rows.map(normalizeRow);
}

export async function revokeApiKey(id) {
  await initDb();
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    const result = await pool.query(
      `
        UPDATE api_key
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE id = $1
        RETURNING id, name, key_prefix, created_at, last_used_at, revoked_at
      `,
      [String(id)]
    );
    return normalizeRow(result.rows[0] ?? null);
  }

  const db = await connectSqlite();
  await db.run(
    `
      UPDATE api_key
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `,
    [String(id)]
  );
  const row = await db.get(
    `
      SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
      FROM api_key
      WHERE id = ?
    `,
    [String(id)]
  );
  return normalizeRow(row);
}

export async function getApiKeyByValue(rawKey) {
  const token = String(rawKey || "").trim();
  if (!token) {
    return null;
  }
  const keyHash = hashApiKey(token);
  await initDb();

  let row;
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    const result = await pool.query(
      `
        SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
        FROM api_key
        WHERE key_hash = $1
      `,
      [keyHash]
    );
    row = result.rows[0] ?? null;
  } else {
    const db = await connectSqlite();
    row = await db.get(
      `
        SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
        FROM api_key
        WHERE key_hash = ?
      `,
      [keyHash]
    );
  }
  if (!row) {
    return null;
  }
  return normalizeRow(row);
}

export async function touchApiKeyUsage(id) {
  await initDb();
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    await pool.query(
      `
        UPDATE api_key
        SET last_used_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [String(id)]
    );
    return;
  }

  const db = await connectSqlite();
  await db.run(
    `
      UPDATE api_key
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [String(id)]
  );
}

