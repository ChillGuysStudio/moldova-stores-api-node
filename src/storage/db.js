import fs from "node:fs";
import path from "node:path";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import pg from "pg";

const DEFAULT_DB_PATH = "data/product_identity.sqlite3";
let sqlitePromise = null;
let sqlitePath = null;
let postgresPool = null;
let postgresUrl = null;

export function getIdentityDbBackend() {
  const backend = process.env.IDENTITY_DB_BACKEND;
  if (!backend) {
    throw new Error("IDENTITY_DB_BACKEND is required and must be either 'sqlite' or 'postgres'");
  }
  const normalized = backend.trim().toLowerCase();
  if (normalized !== "sqlite" && normalized !== "postgres") {
    throw new Error("IDENTITY_DB_BACKEND must be either 'sqlite' or 'postgres'");
  }
  return normalized;
}

export function getDbPath() {
  return process.env.PRODUCT_IDENTITY_DB || DEFAULT_DB_PATH;
}

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when IDENTITY_DB_BACKEND=postgres");
  }
  return databaseUrl;
}

export async function connectSqlite() {
  const dbPath = getDbPath();
  if (!sqlitePromise || sqlitePath !== dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqlitePath = dbPath;
    sqlitePromise = open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }
  return sqlitePromise;
}

export function connectPostgres() {
  const databaseUrl = getDatabaseUrl();
  if (!postgresPool || postgresUrl !== databaseUrl) {
    postgresUrl = databaseUrl;
    postgresPool = new pg.Pool({
      connectionString: databaseUrl
    });
  }
  return postgresPool;
}

export async function initDb() {
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    await pool.query(createIdentityTableSql());
    await pool.query(createApiKeyTableSql());
    return;
  }
  const db = await connectSqlite();
  await db.exec(createIdentityTableSql().replaceAll("TIMESTAMPTZ", "TEXT"));
  await db.exec(createApiKeyTableSql().replaceAll("TIMESTAMPTZ", "TEXT"));
}

function createIdentityTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS product_identity (
        store TEXT NOT NULL,
        source_id TEXT NOT NULL,
        url TEXT,
        sku TEXT,
        name TEXT,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (store, source_id)
    )
  `;
}

function createApiKeyTableSql() {
  return `
    CREATE TABLE IF NOT EXISTS api_key (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
    )
  `;
}
