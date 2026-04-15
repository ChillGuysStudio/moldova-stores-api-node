import { STORE_CAPABILITIES } from "./config.js";

function productSchema() {
  return {
    type: "object",
    properties: {
      store: { type: "string" },
      source_id: { type: ["string", "null"] },
      sku: { type: ["string", "null"] },
      name: { type: "string" },
      brand: { type: ["string", "null"] },
      category: { type: ["string", "null"] },
      url: { type: ["string", "null"] },
      image: { type: ["string", "null"] },
      images: {
        type: "array",
        items: { type: "string" }
      },
      price: {
        type: "object",
        properties: {
          current: { type: ["number", "null"] },
          old: { type: ["number", "null"] },
          currency: { type: "string" }
        }
      },
      availability: {
        type: "string",
        enum: ["in_stock", "out_of_stock", "preorder", "unknown"]
      },
      short_description: { type: ["string", "null"] },
      source_type: { type: "string" },
      raw: { type: "object" }
    }
  };
}

export function buildOpenApiDocument(baseUrl) {
  const servers = [];
  if (baseUrl) {
    servers.push({ url: baseUrl });
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Moldova Stores Product API Node",
      description: "Romanian-only read API for product data from Moldovan stores.",
      version: "0.1.0"
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        }
      },
      schemas: {
        Product: productSchema(),
        ApiKey: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            key_prefix: { type: "string" },
            created_at: { type: ["string", "null"] },
            last_used_at: { type: ["string", "null"] },
            revoked_at: { type: ["string", "null"] }
          }
        },
        ProductList: {
          type: "object",
          properties: {
            store: { type: "string" },
            query: { type: "string" },
            page: { type: "integer" },
            page_size: { type: ["integer", "null"] },
            products: {
              type: "array",
              items: { $ref: "#/components/schemas/Product" }
            },
            total: { type: ["integer", "null"] }
          }
        },
        MultiStoreProductSearch: {
          type: "object",
          properties: {
            query: { type: "string" },
            page: { type: "integer" },
            page_size: { type: ["integer", "null"] },
            stores: {
              type: "array",
              items: { type: "string" }
            },
            results: {
              type: "object",
              additionalProperties: { $ref: "#/components/schemas/ProductList" }
            },
            errors: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  store: { type: "string" },
                  message: { type: "string" }
                }
              }
            }
          }
        },
        StoreCapabilities: {
          type: "object",
          properties: {
            store: { type: "string" },
            name: { type: "string" },
            base_url: { type: "string" },
            supports_search: { type: "boolean" },
            supports_url_fetch: { type: "boolean" },
            supports_id_fetch: {
              type: "string",
              enum: ["direct", "search_resolved", "cached_or_resolved"]
            },
            notes: { type: ["string", "null"] }
          }
        }
      }
    },
    paths: {
      "/ping": {
        get: {
          summary: "Health ping",
          responses: {
            200: {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/stores": {
        get: {
          summary: "List supported stores",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Store capabilities",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/StoreCapabilities" }
                  },
                  example: Object.values(STORE_CAPABILITIES)
                }
              }
            }
          }
        }
      },
      "/products/search": {
        get: {
          summary: "Search products across one or more stores",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "stores", in: "query", required: false, schema: { type: "string" } },
            { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
            {
              name: "page_size",
              in: "query",
              required: false,
              schema: { type: "integer", default: 20, minimum: 1, maximum: 100 }
            }
          ],
          responses: {
            200: {
              description: "Grouped multi-store search response",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MultiStoreProductSearch" }
                }
              }
            }
          }
        }
      },
      "/products/by-url": {
        get: {
          summary: "Fetch a product by absolute product URL",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "url",
              in: "query",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: {
              description: "Normalized product",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Product" }
                }
              }
            }
          }
        }
      },
      "/products/{store}/{sourceId}": {
        get: {
          summary: "Fetch a product by store and source id",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "store",
              in: "path",
              required: true,
              schema: { type: "string", enum: Object.keys(STORE_CAPABILITIES) }
            },
            {
              name: "sourceId",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: {
              description: "Normalized product",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Product" }
                }
              }
            }
          }
        }
      },
      "/admin/api-keys": {
        get: {
          summary: "List API keys",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "API key metadata",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ApiKey" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: "Create API key",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" }
                  },
                  required: ["name"]
                }
              }
            }
          },
          responses: {
            201: {
              description: "Created API key",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/ApiKey" },
                      {
                        type: "object",
                        properties: {
                          api_key: { type: "string" }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      "/admin/api-keys/{id}/revoke": {
        post: {
          summary: "Revoke API key",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: {
              description: "Revoked API key metadata",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiKey" }
                }
              }
            }
          }
        }
      }
    }
  };
}

export function swaggerHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Moldova Stores Product API Node Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html, body { margin: 0; padding: 0; }
      body { background: #ffffff; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui"
      });
    </script>
  </body>
</html>`;
}
