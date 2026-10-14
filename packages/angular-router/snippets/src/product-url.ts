import { createUrl } from "@loozo/angular-router";
import product from "./routes/product/definition.js";

createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
}); // "/products/42?tab=reviews#summary"
