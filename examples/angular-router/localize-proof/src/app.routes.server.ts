import { LOCALE_ID, inject } from "@angular/core";
import { RenderMode, type ServerRoute } from "@angular/ssr";
import { serverRoutePath } from "@loozo/angular-router";
import { destination as product } from "./routes/products/$productId/destination.generated.js";

// One policy names the product route in every locale. Only product 1 is prerendered; other ids
// fall back to server rendering.
export const serverRoutes: ServerRoute[] = [
  {
    path: serverRoutePath(product),
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const locale = inject(LOCALE_ID);

      console.log(`prerender ${locale} ${serverRoutePath(product)}`);

      return [{ productId: "1" }];
    },
  },
  { path: "**", renderMode: RenderMode.Server },
];
