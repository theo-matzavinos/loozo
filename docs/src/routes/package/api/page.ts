import { Component, computed, inject } from "@angular/core";
import { CurrentPackage } from "../../../package-content.js";
import { pageTitle } from "../../../page-title.js";
import { SymbolDetails } from "../../../symbol-details.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [SymbolDetails],
  template: `
    @if (page(); as page) {
      <article class="prose">
        <p class="meta">{{ page.packageName }}</p>
        <h1>
          <code>{{ page.symbol.name }}</code>
        </h1>
        <docs-symbol-details [symbol]="page.symbol" [importable]="true" />
      </article>
    }
  `,
})
export default class ApiSymbolPage {
  readonly route = injectRoute();
  readonly content = inject(CurrentPackage);

  /** The route's guard has checked that the symbol exists. */
  readonly page = computed(() => {
    const params = this.route.params();
    const content = this.content();

    for (const entryPoint of content.entryPoints) {
      for (const symbol of entryPoint.symbols) {
        if (symbol.slug === params.symbol) {
          return { packageName: content.name, symbol };
        }
      }
    }

    return undefined;
  });

  constructor() {
    pageTitle(() => {
      const page = this.page();

      if (page === undefined) {
        return undefined;
      }

      return `${page.symbol.name} · ${page.packageName}`;
    });
  }
}
