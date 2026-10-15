import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ContentHtml } from "../../../content-html.js";
import { CurrentPackage } from "../../../package-content.js";
import { pageTitle } from "../../../page-title.js";
import { kindLabels } from "../../../symbol-details.js";
import { injectRoute } from "./route.generated.js";
import { destination as guide } from "../guide/$guide/route.generated.js";
import { destination as api } from "../api/$symbol/route.generated.js";
import { destination as generatedApi } from "../generated-api/route.generated.js";

@Component({
  imports: [RouterLink, ContentHtml],
  template: `
    @if (page(); as page) {
      <article class="prose">
        <h1>{{ page.content.name }}</h1>
        <p class="meta">Version {{ page.content.version }}</p>
        <div [docsContentHtml]="page.content.overviewHtml"></div>

        @if (page.guides.length > 0) {
          <h2>Guides</h2>
          <ul>
            @for (entry of page.guides; track entry.slug) {
              <li>
                <a [routerLink]="entry.link">{{ entry.title }}</a>
              </li>
            }
          </ul>
        }

        <h2>API</h2>
        @for (entryPoint of page.entryPoints; track entryPoint.importPath) {
          <h3>
            <code>{{ entryPoint.importPath }}</code>
          </h3>
          <dl class="symbol-index">
            @for (entry of entryPoint.symbols; track entry.symbol.slug) {
              <dt>
                <a [routerLink]="entry.link"
                  ><code>{{ entry.symbol.name }}</code></a
                >
                <span class="kind">{{ kindLabels[entry.symbol.kind] }}</span>
              </dt>
              <dd [docsContentHtml]="entry.symbol.summaryHtml"></dd>
            }
          </dl>
        }

        @if (page.generatedApi; as link) {
          <h2>Generated code</h2>
          <p>
            Some types reach your code through files the package generates for you.
            <a [routerLink]="link">See the generated API</a>.
          </p>
        }
      </article>
    }
  `,
})
export default class PackageOverview {
  readonly route = injectRoute();
  readonly content = inject(CurrentPackage);
  readonly kindLabels = kindLabels;

  readonly page = computed(() => {
    const params = this.route.params();
    const content = this.content();
    const guides = [];

    for (const page of content.guides) {
      const link = this.route.link(guide, {
        params: { package: params.package, guide: page.slug },
      });

      guides.push({ slug: page.slug, title: page.title, link });
    }

    const entryPoints = [];

    for (const entryPoint of content.entryPoints) {
      const symbols = [];

      for (const symbol of entryPoint.symbols) {
        const link = this.route.link(api, {
          params: { package: params.package, symbol: symbol.slug },
        });

        symbols.push({ symbol, link });
      }

      entryPoints.push({ importPath: entryPoint.importPath, symbols });
    }

    let generatedApiLink = null;

    if (content.generatedApi.length > 0) {
      generatedApiLink = this.route.link(generatedApi, { params: { package: params.package } });
    }

    return { content, guides, entryPoints, generatedApi: generatedApiLink };
  });

  constructor() {
    pageTitle(() => this.page().content.name);
  }
}
