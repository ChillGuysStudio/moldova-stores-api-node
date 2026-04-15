# Moldova Stores Product API Node

Node.js port of the Python `moldova-stores-api` service.

## Architecture

This project is shaped around a few practical constraints:

- It is an API first, but it still serves a small static landing page on `/` so the domain does not look broken when opened in a browser.
- The actual app code lives in `src/`, while `public/` is kept as the web root. This matches the separation most hosting panels expect: source code stays private, public files stay in a dedicated public directory.
- The root `app.js` exists on purpose. On some shared-hosting Passenger/Plesk setups, the startup file is more reliable when it is in the project root, and loading `.env` there happens earlier and more consistently than relying on later startup phases.
- `.env` is loaded by root `app.js`, then `src/main.js` starts the server. This keeps secrets out of source files while still working around hosting quirks.
- The API normalizes very different store integrations behind one shape. Some stores expose JSON APIs, others require HTML parsing, and some need browser-fingerprint curl binaries to avoid being blocked.
- Search pagination is normalized at the API layer. A request like `page=2&page_size=20` means "the next 20 normalized results", even if different stores use different native page sizes under the hood.
- SQLite is supported because shared hosting is often much happier with a local file than with a separate managed database. Postgres is still available when you want a networked database.

## Install

```bash
npm install
```

## Run

```bash
IDENTITY_DB_BACKEND=sqlite npm start
```

Or create a root `.env` file and run:

```bash
npm start
```

Open:

```text
http://127.0.0.1:8000
http://127.0.0.1:8000/docs
```

## Project Layout

```text
app.js               Root entrypoint used by hosting panels and local start
public/              Static files served on /
src/                 Application code
src/main.js          Server bootstrap
src/app.js           Express app wiring
src/adapters/        Store-specific integrations
src/storage/         SQLite/Postgres identity storage
src/utils/           Shared helpers such as logging, curl, parsing
certs/cacert.pem     Optional CA bundle used on hosts with broken system CA paths
logs/app-YYYY-MM-DD.log  Daily runtime log files
```

## Endpoints

```http
GET /stores
GET /products/search?q={query}&page={page}&page_size={page_size}
GET /products/search?stores={store1},{store2}&q={query}&page={page}&page_size={page_size}
GET /products/{store}/{id}
GET /products/by-url?url={product_url}
GET /ping
GET /openapi.json
GET /docs
```

Behavior:

- `/`, `/index.html`, and `/docs` return HTML.
- `/openapi.json`, `/ping`, and all API routes return JSON.
- Unknown routes return JSON `404` instead of host-generated HTML.

## Environment

```bash
IDENTITY_DB_BACKEND=sqlite
PRODUCT_IDENTITY_DB=data/product_identity.sqlite3
SEARCH_CACHE_TTL_SECONDS=300
SEARCH_CACHE_MAX_ENTRIES=512
SELF_PING_INTERVAL_SECONDS=780
PORT=8000
CURL_IMPERSONATE_BIN=/absolute/path/to/curl_chrome
```

For Postgres:

```bash
IDENTITY_DB_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Example `.env` in the project root:

```bash
IDENTITY_DB_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
PORT=8000
SEARCH_CACHE_TTL_SECONDS=300
SEARCH_CACHE_MAX_ENTRIES=512
SELF_PING_BASE_URL=https://pricehistory.md
SELF_PING_INTERVAL_SECONDS=60
NODE_ENV=production
CURL_CA_BUNDLE=/var/www/vhosts/pricehistory.md/nodeapp/certs/cacert.pem
SSL_CERT_FILE=/var/www/vhosts/pricehistory.md/nodeapp/certs/cacert.pem
```

Why these values exist:

- `IDENTITY_DB_BACKEND`: switches between local SQLite and Postgres.
- `PRODUCT_IDENTITY_DB`: explicit SQLite path if you do not want the default `data/product_identity.sqlite3`.
- `SEARCH_CACHE_TTL_SECONDS` and `SEARCH_CACHE_MAX_ENTRIES`: cache native store search pages so normalized pagination does not keep refetching the same pages.
- `SELF_PING_BASE_URL` and `SELF_PING_INTERVAL_SECONDS`: optional keep-warm ping for hosts that aggressively idle apps.
- `CURL_CA_BUNDLE` and `SSL_CERT_FILE`: useful on shared hosts where bundled curl binaries cannot find the system CA store automatically.

For hosts like Plesk, use:

- `Application Root`: `/nodeapp`
- `Application Startup File`: `app.js`
- `Document Root`: `/nodeapp/public`
- Keep `.env` in `/nodeapp/.env`; root `app.js` loads it before starting the app

The Plesk-specific choices are intentional:

- `app.js` in the project root is the startup file because Passenger/Plesk tends to behave more predictably with a root entrypoint than with `src/main.js`.
- `Document Root` points to `public/`, not `src/public`, because source code and public files should stay separate.
- `.env` sits in the project root because the root entrypoint loads it before importing the rest of the app.

## Bundled curl-impersonate

The app can auto-detect a bundled impersonation binary at runtime based on `process.platform` and `process.arch`.

Put the executable in one of these locations:

```text
bin/linux-x64/curl_chrome
bin/linux-arm64/curl_chrome
bin/darwin-arm64/curl_chrome
bin/darwin-x64/curl_chrome
```

It will also check:

```text
bin/curl_chrome
```

`CURL_IMPERSONATE_BIN` still takes priority if you want to point to a custom path.

This exists because some stores do not respond reliably to plain Node HTTP clients on shared hosting. The bundled curl binaries give the app a more browser-like network fingerprint where needed.

## Storage Notes

The identity store is intentionally simple:

- one logical mapping table
- primary key on `(store, source_id)`
- optional SQLite file backend for cheap hosting

If you only need URL to ID mapping, SQLite is usually enough on shared hosting, and the current schema can still hold a large number of rows before disk usage becomes a real issue.
