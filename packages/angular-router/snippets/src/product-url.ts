import { createUrl } from "@loozo/angular-router";
import { destination as product } from "./routes/products/$productId/destination.generated.js";

createUrl(product, {
  params: { productId: 42 },
  search: { tab: "reviews" },
  fragment: "summary",
}); // "/products/42?tab=reviews#summary"
