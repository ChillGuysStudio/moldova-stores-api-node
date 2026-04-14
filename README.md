# Moldova Stores Product API Node

Node.js port of the Python `moldova-stores-api` service.

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
SELF_PING_INTERVAL_SECONDS=780
NODE_ENV=production
CURL_CA_BUNDLE=/var/www/vhosts/pricehistory.md/nodeapp/certs/cacert.pem
SSL_CERT_FILE=/var/www/vhosts/pricehistory.md/nodeapp/certs/cacert.pem
```

For hosts like Plesk, use:

- `Application Root`: `/nodeapp`
- `Application Startup File`: `app.js`
- `Document Root`: `/nodeapp/public`

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
