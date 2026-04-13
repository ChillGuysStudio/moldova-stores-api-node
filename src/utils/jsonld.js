import { soupFromHtml } from "./html.js";

function *iterNodes(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      yield *iterNodes(item);
    }
    return;
  }

  if (!data || typeof data !== "object") {
    return;
  }

  yield data;
  const graph = data["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      yield *iterNodes(item);
    }
  }
}

export function findProductJsonLd(html) {
  const $ = soupFromHtml(html);
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    const text = $(element).html()?.trim();
    if (!text) {
      continue;
    }
    try {
      const data = JSON.parse(text);
      for (const node of iterNodes(data)) {
        const nodeType = node["@type"];
        if (nodeType === "Product" || (Array.isArray(nodeType) && nodeType.includes("Product"))) {
          return node;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}
