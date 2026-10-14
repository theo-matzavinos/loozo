import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ContentHtml } from "../../../content-html.js";
import { NotFound } from "../../../not-found.js";
import { CurrentPackage } from "../../../package-content.js";
import { pageTitle } from "../../../page-title.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink, ContentHtml, NotFound],
  template: `
    @if (page() === null) {
      <docs-not-found />
    } @else if (page(); as page) {
      <article class="prose">
        <p class="meta">{{ page.packageName }}</p>
        <h1>{{ page.guide.title }}</h1>

        @if (page.guide.headings.length > 0) {
          <nav class="toc" aria-labelledby="toc-heading">
            <h2 id="toc-heading">On this page</h2>
            <ul>
              @for (heading of page.guide.headings; track heading.id) {
                <li [class.nested]="heading.level === 4">
                  <!-- Untyped: typed links only accept fragments declared on the route. -->
                  <a [routerLink]="[]" [fragment]="heading.id">{{ heading.text }}</a>
                </li>
              }
            </ul>
          </nav>
        }

        <div [docsContentHtml]="page.guide.html"></div>

        <nav class="pager" aria-label="Guides">
          @if (page.previous; as previous) {
            <a class="previous" [routerLink]="previous.link" rel="prev">
              <span>Previous</span> {{ previous.title }}
            </a>
          }
          @if (page.next; as next) {
            <a class="next" [routerLink]="next.link" rel="next">
              <span>Next</span> {{ next.title }}
            </a>
          }
        </nav>
      </article>
    }
  `,
})
export default class Guide {
  readonly route = injectRoute();
  readonly content = inject(CurrentPackage);

  /** undefined while loading, null when the package has no such guide. */
  readonly page = computed(() => {
    const params = this.route.params.value();
    const content = this.content();

    if (params === undefined || !content) {
      return undefined;
    }

    const index = content.guides.findIndex((candidate) => candidate.slug === params.guide);

    if (index === -1) {
      return null;
    }

    let previous = null;
    let next = null;

    if (index > 0) {
      const target = content.guides[index - 1];
      const link = this.route.link({ params: { package: params.package, guide: target.slug } });

      previous = { title: target.title, link };
    }

    if (index < content.guides.length - 1) {
      const target = content.guides[index + 1];
      const link = this.route.link({ params: { package: params.package, guide: target.slug } });

      next = { title: target.title, link };
    }

    return { packageName: content.name, guide: content.guides[index], previous, next };
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

      return `${page.guide.title} · ${page.packageName}`;
    });
  }
}
