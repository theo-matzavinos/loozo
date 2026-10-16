import { Component, computed, inject } from "@angular/core";
import { NgComponentOutlet } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ContentHtml } from "../../../../content-html.js";
import { CurrentPackage, findGuide } from "../../../../package-content.js";
import { pageTitle } from "../../../../page-title.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink, ContentHtml, NgComponentOutlet],
  template: `
    @if (page(); as page) {
      <article class="prose">
        <p class="meta">{{ page.packageName }}</p>
        <h1>{{ page.guide.title }}</h1>

        @if (page.guide.headings.length > 0) {
          <nav class="toc" aria-labelledby="toc-heading">
            <h2 id="toc-heading">On this page</h2>
            <ul>
              @for (heading of page.guide.headings; track heading.id) {
                <li [class.nested]="heading.level > page.topLevel">
                  <!-- Same-page anchors to content headings aren't route destinations, so not typed links. -->
                  <a [routerLink]="[]" [fragment]="heading.id">{{ heading.text }}</a>
                </li>
              }
            </ul>
          </nav>
        }

        @for (block of page.blocks; track $index) {
          @if (block.kind === "html") {
            <div [docsContentHtml]="block.html"></div>
          } @else {
            <div class="docs-demo">
              <div class="docs-demo-output" role="group" aria-label="Running example">
                <ng-container *ngComponentOutlet="block.component" />
              </div>
              <div [docsContentHtml]="block.sourceHtml"></div>
            </div>
          }
        }

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

  /** The route's guard has checked that the guide exists. */
  readonly page = computed(() => {
    const params = this.route.params();
    const content = this.content();
    const found = findGuide(content, params.guide);

    if (found === undefined) {
      return undefined;
    }

    const { guide, sequence } = found;
    const index = sequence.indexOf(guide);
    let previous = null;
    let next = null;

    if (index > 0) {
      const target = sequence[index - 1];
      const link = this.route.link({ params: { package: params.package, guide: target.slug } });

      previous = { title: target.title, link };
    }

    if (index < sequence.length - 1) {
      const target = sequence[index + 1];
      const link = this.route.link({ params: { package: params.package, guide: target.slug } });

      next = { title: target.title, link };
    }

    // The table of contents indents headings below the page's top level.
    let topLevel = 4;

    for (const heading of guide.headings) {
      topLevel = Math.min(topLevel, heading.level);
    }

    const demos = this.route.data().demos;
    const blocks = [];

    for (const block of guide.blocks) {
      if (block.kind === "html") {
        blocks.push(block);
      } else {
        blocks.push({ ...block, component: demos.get(block.demo)! });
      }
    }

    return { packageName: content.name, guide, blocks, topLevel, previous, next };
  });

  constructor() {
    pageTitle(() => {
      const page = this.page();

      if (page === undefined) {
        return undefined;
      }

      return `${page.guide.title} · ${page.packageName}`;
    });
  }
}
