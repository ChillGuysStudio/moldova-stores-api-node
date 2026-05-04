# Moldova Stores Product API Node

Node.js API for normalized product search and product lookup across Moldovan electronics stores.

The service hides several different store integrations behind one API shape. Some stores expose JSON APIs, some are parsed from HTML, and Bomba uses bundled `curl-impersonate` binaries because regular Node HTTP requests are unreliable there.

## Features

- Multi-store product search.
- Store-filtered search with normalized pagination.
- Unified category filters for search.
- Unified sorting: lowest price, highest price, popularity, or store default.
- Product lookup by store/source ID where supported.
- Product lookup by product URL.
- API key authentication for public API routes.
- Admin endpoints for creating and revoking API keys.
- SQLite or Postgres storage for API keys and product identity mappings.
- In-memory native search cache to reduce repeated requests to store sites.
- OpenAPI JSON and Swagger UI docs.

## Supported Stores

| Store | Search | By URL | By ID | Notes |
| --- | --- | --- | --- | --- |
| Smart.md | Yes | Yes | Direct | Uses Visely catalog/search API. |
| Bomba.md | Yes | Yes | Direct | Uses `curl-impersonate`. |
| Maximum.md | Yes | Yes | Direct | Uses Romanian PJAX search HTML and compare-cookie JSON for ID lookup. |
| Enter.online | Yes | Yes | Cached/resolved | Search uses `search-fetch`; cold ID lookup needs a prior search or by-url identity mapping. |
| Darwin.md | Yes | Yes | Cached/resolved | Cold ID lookup needs a prior search or by-url identity mapping. |
| Ultra.md | Yes | Yes | Cached/resolved | Cold ID lookup needs a prior search or by-url identity mapping. |

## Requirements

- Node.js `>=20`
- npm
- SQLite, or a Postgres database URL

The repository includes platform-specific `curl-impersonate` binaries under `bin/` for stores that need browser-like requests.

## Install

```bash
npm install
```

## Local Setup

Create `.env` in the project root:

```env
NODE_ENV=development
PORT=8000

IDENTITY_DB_BACKEND=sqlite
PRODUCT_IDENTITY_DB=data/product_identity.sqlite3

ADMIN_TOKEN=replace-with-a-long-random-token

SEARCH_CACHE_TTL_SECONDS=900
SEARCH_CACHE_MAX_ENTRIES=512
```

Start the app:

```bash
npm start
```

For development with Node watch mode:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8000
http://127.0.0.1:8000/docs
http://127.0.0.1:8000/openapi.json
```

Health check:

```bash
curl http://127.0.0.1:8000/ping
```

Expected response:

```json
{ "status": "ok" }
```

## Create an API Key

Product and store routes require a bearer API key. The admin token can also be used directly, but for clients it is better to create separate API keys.

Create a client key:

```bash
curl -X POST http://127.0.0.1:8000/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"local-dev"}'
```

The response includes `api_key` once. Store that value somewhere safe.

List keys:

```bash
curl http://127.0.0.1:8000/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Revoke a key:

```bash
curl -X POST http://127.0.0.1:8000/admin/api-keys/{id}/revoke \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## API Usage

Use the client API key on protected routes:

```bash
curl "http://127.0.0.1:8000/stores" \
  -H "Authorization: Bearer $API_KEY"
```

Search all stores:

```bash
curl "http://127.0.0.1:8000/products/search?q=iphone&page=1&page_size=20" \
  -H "Authorization: Bearer $API_KEY"
```

Search selected stores:

```bash
curl "http://127.0.0.1:8000/products/search?q=iphone&stores=smart,maximum,ultra" \
  -H "Authorization: Bearer $API_KEY"
```

Search by category:

```bash
curl "http://127.0.0.1:8000/products/search?q=iphone&category=phones" \
  -H "Authorization: Bearer $API_KEY"
```

Search with sorting:

```bash
curl "http://127.0.0.1:8000/products/search?q=iphone&sort=lowest" \
  -H "Authorization: Bearer $API_KEY"
```

Supported sort values:

```text
price_asc, lowest, lowest_first, low_to_high, cheapest, cheap, asc
price_desc, highest, highest_first, high_to_low, expensive, desc
popularity, popular
```

If `sort` is omitted, each store uses its own default ordering.

List supported categories:

```bash
curl "http://127.0.0.1:8000/products/categories" \
  -H "Authorization: Bearer $API_KEY"
```

Lookup by product URL:

```bash
curl --get "http://127.0.0.1:8000/products/by-url" \
  --data-urlencode "url=https://maximum.md/ro/product/..." \
  -H "Authorization: Bearer $API_KEY"
```

Lookup by store and source ID:

```bash
curl "http://127.0.0.1:8000/products/maximum/6466647" \
  -H "Authorization: Bearer $API_KEY"
```

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` | No | Static landing page. |
| `GET` | `/ping` | No | Health check. |
| `GET` | `/docs` | No | Swagger UI. |
| `GET` | `/openapi.json` | No | OpenAPI document. In production, admin routes are omitted from docs. |
| `GET` | `/stores` | API key | Supported store metadata. |
| `GET` | `/products/search` | API key | Search products across one or more stores. |
| `GET` | `/products/categories` | API key | Supported unified search categories. |
| `GET` | `/products/by-url` | API key | Resolve a product URL. |
| `GET` | `/products/:store/:sourceId` | API key | Resolve a store product ID. |
| `GET` | `/admin/api-keys` | Admin token | List API keys. |
| `POST` | `/admin/api-keys` | Admin token | Create API key. |
| `POST` | `/admin/api-keys/:id/revoke` | Admin token | Revoke API key. |

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | unset | Use `production` in production. Production reduces request logging and hides admin routes from OpenAPI docs. |
| `PORT` | No | `8000` | HTTP port. |
| `ADMIN_TOKEN` | Yes for admin/API bootstrap | unset | Bearer token for admin routes. It can also access protected API routes. |
| `IDENTITY_DB_BACKEND` | Yes | unset | Must be `sqlite` or `postgres`. |
| `PRODUCT_IDENTITY_DB` | SQLite only | `data/product_identity.sqlite3` | SQLite database path. |
| `DATABASE_URL` | Postgres only | unset | Postgres connection string. |
| `SEARCH_CACHE_TTL_SECONDS` | No | `300` | In-memory native search cache TTL. Use `0` or lower to disable. |
| `SEARCH_CACHE_MAX_ENTRIES` | No | `512` | Maximum native search cache entries. |
| `SELF_PING_BASE_URL` | No | unset | If set, the app periodically calls `{SELF_PING_BASE_URL}/ping`. |
| `SELF_PING_INTERVAL_SECONDS` | No | `60` | Self-ping interval. |
| `CURL_IMPERSONATE_BIN` | No | auto-detected | Absolute path to a custom `curl-impersonate` binary. |
| `CURL_CA_BUNDLE` | No | unset | CA bundle path for curl. Useful on some shared hosts. |
| `SSL_CERT_FILE` | No | unset | CA bundle path for Node/OpenSSL. Useful on some shared hosts. |

## Search Cache

Search cache is in-memory and per Node process. It is used for native store pages before the API slices results into normalized pages.

Default:

```env
SEARCH_CACHE_TTL_SECONDS=300
SEARCH_CACHE_MAX_ENTRIES=512
```

A practical production value is often:

```env
SEARCH_CACHE_TTL_SECONDS=900
```

The cache key includes:

```text
store + query + category + sort + native page
```

Different sorting or category filters create different cache entries.

## Storage

The database stores:

- API key hashes and metadata.
- Product identity mappings used for stores where cold ID lookup is not reliable.

SQLite is usually enough for a small deployment:

```env
IDENTITY_DB_BACKEND=sqlite
PRODUCT_IDENTITY_DB=data/product_identity.sqlite3
```

Postgres is better for multi-instance production deployments:

```env
IDENTITY_DB_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Tables are created automatically on startup.

## Production Setup

Use this as a baseline `.env`:

```env
NODE_ENV=production
PORT=8000

ADMIN_TOKEN=replace-with-a-long-random-token

IDENTITY_DB_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname

SEARCH_CACHE_TTL_SECONDS=900
SEARCH_CACHE_MAX_ENTRIES=512

SELF_PING_BASE_URL=https://your-domain.example
SELF_PING_INTERVAL_SECONDS=780
```

Install dependencies and start:

```bash
npm ci --omit=dev
npm start
```

Recommended production notes:

- Run behind HTTPS through Nginx, Caddy, Apache, Plesk, or another reverse proxy.
- Keep `.env` outside the public web root.
- Use a strong `ADMIN_TOKEN`.
- Create client API keys and do not share the admin token with clients.
- Use Postgres if you run multiple Node processes or multiple servers.
- Make sure `bin/linux-x64/*` or `bin/linux-arm64/*` binaries are executable on Linux hosts.
- Persist `data/` if using SQLite.
- Persist or collect `logs/` if you need runtime diagnostics.

## Plesk / Passenger Notes

This repository keeps a root `app.js` intentionally. Some shared-hosting Node runners are more reliable with a startup file in the application root.

Typical Plesk settings:

```text
Application Root: /nodeapp
Application Startup File: app.js
Document Root: /nodeapp/public
```

Keep `.env` in the application root:

```text
/nodeapp/.env
```

The root `app.js` loads `.env` before importing `src/main.js`, so environment variables are available during database and adapter initialization.

For hosts with CA bundle problems, set:

```env
CURL_CA_BUNDLE=/absolute/path/to/certs/cacert.pem
SSL_CERT_FILE=/absolute/path/to/certs/cacert.pem
```

## curl-impersonate

The app auto-detects bundled binaries based on platform and architecture. Current bundled paths include:

```text
bin/linux-x64/curl-impersonate-chrome
bin/linux-arm64/curl-impersonate-chrome
bin/darwin-x64/curl-impersonate-chrome
```

There are also versioned aliases like:

```text
bin/linux-x64/curl_chrome107
bin/linux-x64/curl_chrome110
bin/linux-x64/curl_chrome116
```

Set `CURL_IMPERSONATE_BIN` if you need to override detection:

```env
CURL_IMPERSONATE_BIN=/absolute/path/to/curl-impersonate-chrome
```

If a production deploy fails only for Bomba while other stores work, check binary permissions first:

```bash
chmod +x bin/linux-x64/curl-impersonate-chrome
```

## Project Layout

```text
app.js                  Root startup file; loads .env and imports src/main.js
public/                 Static landing page served on /
src/main.js             Server bootstrap and shutdown handling
src/app.js              Express app wiring
src/adapters/           Store-specific integrations
src/routes/             API and admin routes
src/storage/            SQLite/Postgres storage
src/utils/              Shared parsing, HTTP, logging, and normalization helpers
src/categories.js       Unified search category mapping
src/sort.js             Unified sort aliases
src/searchCache.js      In-memory native search cache
tests/                  Node test suite
certs/cacert.pem        Optional CA bundle
logs/                   Daily runtime logs
```

## Tests

Run the test suite:

```bash
npm test
```

The tests cover normalization helpers, API-key storage, OpenAPI generation, search pagination/cache behavior, and adapter category extraction helpers.

## Operational Notes

- Search results are normalized after each store returns its native page size.
- Some stores do not support reliable cold ID lookup. Search or by-url lookup stores identity mappings that can later make ID lookup work.
- `product.category` is store-scraped data only. The unified `category` query parameter is used for search filtering and is not copied into product results unless the store response/page itself exposes that category.
- Search cache is not shared across processes. Use one Node process or Postgres plus an external cache if you need coordinated multi-process behavior later.
