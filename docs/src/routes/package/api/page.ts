import { Component, computed, inject } from "@angular/core";
import { NotFound } from "../../../not-found.js";
import { CurrentPackage } from "../../../package-content.js";
import { pageTitle } from "../../../page-title.js";
import { SymbolDetails } from "../../../symbol-details.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [NotFound, SymbolDetails],
  template: `
    @if (page() === null) {
      <docs-not-found />
    } @else if (page(); as page) {
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

  /** undefined while loading, null when no public entry point exports such a symbol. */
  readonly page = computed(() => {
    const params = this.route.params.value();
    const content = this.content();

    if (params === undefined || !content) {
      return undefined;
    }

    for (const entryPoint of content.entryPoints) {
      for (const symbol of entryPoint.symbols) {
        if (symbol.slug === params.symbol) {
          return { packageName: content.name, symbol };
        }
      }
    }

    return null;
  });

  constructor() {
    pageTitle(() => {
      const page = this.page();

      if (page === undefined) {
        return undefined;
      }

      if (page === null) {
        return "Page not found";
      }

      return `${page.symbol.name} · ${page.packageName}`;
    });
  }
}
