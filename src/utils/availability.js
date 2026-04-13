export function normalizeAvailability(value) {
  if (value === null || value === undefined) {
    return "unknown";
  }
  const text = String(value).toLowerCase();
  if (text.includes("instock") || text === "1" || text === "true" || text === "in_stock") {
    return "in_stock";
  }
  if (
    text.includes("outofstock") ||
    text.includes("out_of_stock") ||
    text === "0" ||
    text === "false"
  ) {
    return "out_of_stock";
  }
  if (text.includes("preorder") || text.includes("precomanda")) {
    return "preorder";
  }
  return "unknown";
}
