export function normalizeAvailability(value) {
  if (value === null || value === undefined) {
    return "unknown";
  }
  const text = String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    text.includes("outofstock") ||
    text.includes("out of stock") ||
    text.includes("out_of_stock") ||
    text.includes("indisponibil") ||
    text.includes("nu este in stoc") ||
    text.includes("stoc epuizat") ||
    text === "0" ||
    text === "false"
  ) {
    return "out_of_stock";
  }
  if (text.includes("preorder") || text.includes("precomanda") || text.includes("la comanda")) {
    return "preorder";
  }
  if (
    text.includes("instock") ||
    text.includes("in stock") ||
    text.includes("in stoc") ||
    text.includes("disponibil") ||
    text === "1" ||
    text === "true" ||
    text === "in_stock"
  ) {
    return "in_stock";
  }
  return "unknown";
}
