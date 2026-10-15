import { Component, inject } from "@angular/core";
import { CurrentPackage } from "../../../package-content.js";
import { pageTitle } from "../../../page-title.js";
import { SymbolDetails } from "../../../symbol-details.js";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [SymbolDetails],
  template: `
    @if (content(); as page) {
      <article class="prose">
        <p class="meta">{{ page.name }}</p>
        <h1>Generated API</h1>
        <p class="lede">
          These are the types you meet through code the package generates for you, such as the files
          written next to your routes. They come from internal entry points: don't import them
          yourself. Use them through the generated code, and read them here to understand what it
          gives you.
        </p>
        @for (symbol of page.generatedApi; track symbol.slug) {
          <section class="generated-symbol" [id]="symbol.slug">
            <h2>
              <code>{{ symbol.name }}</code>
            </h2>
            <docs-symbol-details [symbol]="symbol" [importable]="false" [headingLevel]="3" />
          </section>
        }
      </article>
    }
  `,
})
export default class GeneratedApi {
  readonly route = injectRoute();
  readonly content = inject(CurrentPackage);

  constructor() {
    pageTitle(() => {
      const content = this.content();

      if (content === undefined) {
        return undefined;
      }

      return `Generated API · ${content.name}`;
    });
  }
}
