import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { packages } from "../../../generated/content/index.generated.js";
import { injectRoute } from "./route.generated.js";
import { destination as packageOverview } from "../package/overview/route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <main id="main" tabindex="-1" class="page">
      <h1>Packages</h1>
      <p class="lede">Angular packages from the loozo monorepo.</p>
      <ul class="package-list">
        @for (item of items; track item.summary.slug) {
          <li>
            <a [routerLink]="item.link">
              <span class="package-name">{{ item.summary.name }}</span>
              <span class="package-version">{{ item.summary.version }}</span>
            </a>
            <p>{{ item.summary.description }}</p>
          </li>
        }
      </ul>
    </main>
  `,
})
export default class Home {
  readonly route = injectRoute();
  readonly items = this.packageItems();

  packageItems() {
    const items = [];

    for (const summary of packages) {
      const link = this.route.link(packageOverview, { params: { package: summary.slug } });

      items.push({ summary, link });
    }

    return items;
  }
}
