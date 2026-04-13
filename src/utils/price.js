export function toFloat(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value).replaceAll(" ", "").replaceAll(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCurrency(value) {
  if (value === null || value === undefined) {
    return "MDL";
  }
  const text = String(value).toUpperCase();
  if (text === "LEI" || text === "MDL") {
    return "MDL";
  }
  return text;
}
