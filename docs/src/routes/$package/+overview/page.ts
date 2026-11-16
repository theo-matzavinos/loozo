import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Article, type ContentsEntry } from "../../../article.js";
import { ContentHtml } from "../../../content-html.js";
import { CurrentPackage } from "../../../package-content.js";
import { pageTitle } from "../../../page-title.js";
import { kindLabels } from "../../../symbol-details.js";
import { injectRoute } from "./route.generated.js";
import { destination as guide } from "../guide/$guide/destination.generated.js";
import { destination as api } from "../api/$symbol/destination.generated.js";
import { destination as generatedApi } from "../generated-api/destination.generated.js";

@Component({
  imports: [RouterLink, Article, ContentHtml],
  template: `
    @if (page(); as page) {
      <docs-article [contents]="page.contents">
        <header>
          <h1>{{ page.content.name }}</h1>
          <p class="meta">Version {{ page.content.version }}</p>
        </header>
        <div [docsContentHtml]="page.content.overviewHtml"></div>

        @if (page.guides.length > 0) {
          <h2 id="guides">Guides</h2>
          <ul>
            @for (entry of page.guides; track entry.slug) {
              <li>
                <a [routerLink]="entry.link">{{ entry.title }}</a>
              </li>
            }
          </ul>
        }

        @if (page.entryPoints.length > 0) {
          <h2 id="api">API</h2>
          @for (entryPoint of page.entryPoints; track entryPoint.importPath) {
            <h3 [id]="entryPoint.id">
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
        }

        @if (page.generatedApi; as link) {
          <h2 id="generated-code">Generated code</h2>
          <p>
            Some types reach your code through files the package generates for you.
            <a [routerLink]="link">See the generated API</a>.
          </p>
        }
      </docs-article>
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
      const link = this.route.link({
        to: guide,
        params: { package: params.package, guide: page.slug },
      });

      guides.push({ slug: page.slug, title: page.title, link });
    }

    const contents: ContentsEntry[] = [];

    if (guides.length > 0) {
      contents.push({ id: "guides", text: "Guides", nested: false });
    }

    if (content.entryPoints.length > 0) {
      contents.push({ id: "api", text: "API", nested: false });
    }

    const entryPoints = [];

    for (const entryPoint of content.entryPoints) {
      // The last import path segment: the subpath, or the package's name for its root.
      const name = entryPoint.importPath.slice(entryPoint.importPath.lastIndexOf("/") + 1);
      const id = `entry-${name}`;
      let text = name;

      // The rail is narrow: subpaths go by their name, and only the root by its whole path.
      if (entryPoint.importPath === content.name) {
        text = entryPoint.importPath;
      }

      contents.push({ id, text, nested: true });

      const symbols = [];

      for (const symbol of entryPoint.symbols) {
        const link = this.route.link({
          to: api,
          params: { package: params.package, symbol: symbol.slug },
        });

        symbols.push({ symbol, link });
      }

      entryPoints.push({ id, importPath: entryPoint.importPath, symbols });
    }

    let generatedApiLink = null;

    if (content.generatedApi.length > 0) {
      generatedApiLink = this.route.link({ to: generatedApi, params: { package: params.package } });
      contents.push({ id: "generated-code", text: "Generated code", nested: false });
    }

    return { content, guides, entryPoints, generatedApi: generatedApiLink, contents };
  });

  constructor() {
    pageTitle(() => this.page().content.name);
  }
}
