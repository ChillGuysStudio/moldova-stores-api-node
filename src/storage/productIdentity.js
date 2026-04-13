import { connectPostgres, connectSqlite, getIdentityDbBackend, initDb } from "./db.js";

export async function saveIdentity({ store, source_id, url = null, sku = null, name = null }) {
  if (source_id === null || source_id === undefined) {
    return;
  }
  await initDb();
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    await pool.query(
      `
        INSERT INTO product_identity (store, source_id, url, sku, name, last_seen_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT(store, source_id) DO UPDATE SET
          url = COALESCE(excluded.url, product_identity.url),
          sku = COALESCE(excluded.sku, product_identity.sku),
          name = COALESCE(excluded.name, product_identity.name),
          last_seen_at = CURRENT_TIMESTAMP
      `,
      [store, String(source_id), url, sku !== null && sku !== undefined ? String(sku) : null, name]
    );
    return;
  }

  const db = await connectSqlite();
  await db.run(
    `
      INSERT INTO product_identity (store, source_id, url, sku, name, last_seen_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(store, source_id) DO UPDATE SET
        url = COALESCE(excluded.url, product_identity.url),
        sku = COALESCE(excluded.sku, product_identity.sku),
        name = COALESCE(excluded.name, product_identity.name),
        last_seen_at = CURRENT_TIMESTAMP
    `,
    [store, String(source_id), url, sku !== null && sku !== undefined ? String(sku) : null, name]
  );
}

export async function getIdentity(store, sourceId) {
  await initDb();
  if (getIdentityDbBackend() === "postgres") {
    const pool = connectPostgres();
    const result = await pool.query(
      `
        SELECT store, source_id, url, sku, name
        FROM product_identity
        WHERE store = $1 AND source_id = $2
      `,
      [store, String(sourceId)]
    );
    return result.rows[0] ?? null;
  }

  const db = await connectSqlite();
  const row = await db.get(
    `
      SELECT store, source_id, url, sku, name
      FROM product_identity
      WHERE store = ? AND source_id = ?
    `,
    [store, String(sourceId)]
  );
  return row ?? null;
}
