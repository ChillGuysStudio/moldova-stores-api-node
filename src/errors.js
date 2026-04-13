export class ProductNotResolvedError extends Error {
  constructor(store, sourceId, message) {
    super(
      message || "This store needs URL mapping first. Use product search or by-url fetch to resolve it."
    );
    this.name = "ProductNotResolvedError";
    this.store = store;
    this.source_id = sourceId;
    this.message = this.message;
  }
}
