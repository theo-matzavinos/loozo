import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Article } from "../../../../article.js";
import { CurrentPackage } from "../../../../package-content.js";
import { pageTitle } from "../../../../page-title.js";
import { SymbolDetails, symbolContents } from "../../../../symbol-details.js";
import { injectRoute } from "./route.generated.js";
import { destination as overview } from "../../+overview/destination.generated.js";
import { destination as guide } from "../../guide/$guide/destination.generated.js";

@Component({
  imports: [RouterLink, Article, SymbolDetails],
  template: `
    @if (page(); as page) {
      <docs-article [contents]="page.contents">
        <header>
          <nav class="meta breadcrumb" aria-label="Breadcrumb">
            <ol>
              @if (page.entryGuide; as entryGuide) {
                <li>
                  <a [routerLink]="page.overview">{{ page.packageName }}</a>
                </li>
                <li>
                  <a [routerLink]="entryGuide.link">{{ entryGuide.title }}</a>
                </li>
              } @else {
                <!-- Without a guide, the entry point's place is its section of the API index. -->
                <li>
                  <a [routerLink]="page.apiIndex">{{ page.importPath }}</a>
                </li>
              }
            </ol>
          </nav>
          <h1>
            <code>{{ page.symbol.name }}</code>
          </h1>
        </header>
        <docs-symbol-details [symbol]="page.symbol" [importable]="true" />
      </docs-article>
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
          const packageParams = { package: params.package };
          let entryGuide = null;

          if (entryPoint.guide !== null) {
            const link = this.route.link({
              to: guide,
              params: { ...packageParams, guide: entryPoint.guide.slug },
            });

            entryGuide = { title: entryPoint.guide.title, link };
          }

          return {
            packageName: content.name,
            importPath: entryPoint.importPath,
            overview: this.route.link({ to: overview, params: packageParams }),
            apiIndex: this.route.link({ to: overview, params: packageParams, fragment: "api" }),
            entryGuide,
            symbol,
            contents: symbolContents(symbol),
          };
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
