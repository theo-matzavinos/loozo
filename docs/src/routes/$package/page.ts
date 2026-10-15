import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";
import { packages } from "../../../generated/content/index.generated.js";
import { CurrentPackage } from "../../package-content.js";
import { injectRoute } from "./route.generated.js";
import { destination as guide } from "./guide/$guide/route.generated.js";
import { destination as api } from "./api/$symbol/route.generated.js";
import { destination as generatedApi } from "./generated-api/route.generated.js";

/** Layout for every page of one package: the documentation sidebar beside the page. */
@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
  ],
  providers: [{ provide: CurrentPackage, useFactory: () => inject(Package).content }],
  template: `
    <div class="layout" ogCollapsible [(expanded)]="menuOpen">
      <button ogCollapsibleTrigger class="menu-button">Contents</button>
      <!-- Collapsed hides the sidebar only under 52rem; styles.css keeps it visible on wider screens. -->
      <nav ogCollapsiblePanel id="sidebar" class="sidebar" (click)="closeMenuAfterLink($event)">
        <ul class="sidebar-packages">
          @for (item of packages; track item.slug) {
            <li>
              <a
                class="sidebar-package"
                [routerLink]="item.link"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                ariaCurrentWhenActive="page"
              >
                {{ item.name }}
              </a>
              @if (item.slug === route.params().package) {
                @if (sections(); as sections) {
                  @if (sections.guides.length > 0) {
                    <h2 class="sidebar-heading">Guides</h2>
                    <ul>
                      @for (entry of sections.guides; track entry.slug) {
                        <li>
                          <a
                            [routerLink]="entry.link"
                            routerLinkActive="active"
                            ariaCurrentWhenActive="page"
                            >{{ entry.title }}</a
                          >
                        </li>
                      }
                    </ul>
                  }
                  @for (entryPoint of sections.entryPoints; track entryPoint.importPath) {
                    <h2 class="sidebar-heading">
                      API <code>{{ entryPoint.importPath }}</code>
                    </h2>
                    <ul>
                      @for (entry of entryPoint.symbols; track entry.slug) {
                        <li>
                          <a
                            [routerLink]="entry.link"
                            routerLinkActive="active"
                            ariaCurrentWhenActive="page"
                            ><code>{{ entry.name }}</code></a
                          >
                        </li>
                      }
                    </ul>
                  }
                  @if (sections.generatedApi; as link) {
                    <h2 class="sidebar-heading">Generated code</h2>
                    <ul>
                      <li>
                        <a
                          [routerLink]="link"
                          routerLinkActive="active"
                          ariaCurrentWhenActive="page"
                          >Generated API</a
                        >
                      </li>
                    </ul>
                  }
                }
              }
            </li>
          }
        </ul>
      </nav>
      <main id="main" tabindex="-1" class="content">
        <router-outlet />
      </main>
    </div>
  `,
})
export default class Package {
  readonly route = injectRoute();

  /** Resolved before this layout's pages activate; see CurrentPackage. */
  readonly content = computed(() => this.route.data().content);

  readonly menuOpen = signal(false);
  readonly packages = this.packageLinks();

  readonly sections = computed(() => {
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

        symbols.push({ slug: symbol.slug, name: symbol.name, link });
      }

      entryPoints.push({ importPath: entryPoint.importPath, symbols });
    }

    let generatedApiLink = null;

    if (content.generatedApi.length > 0) {
      generatedApiLink = this.route.link(generatedApi, { params: { package: params.package } });
    }

    return { guides, entryPoints, generatedApi: generatedApiLink };
  });

  packageLinks() {
    const links = [];

    for (const summary of packages) {
      links.push({
        slug: summary.slug,
        name: summary.name,
        link: this.route.link({ params: { package: summary.slug } }),
      });
    }

    return links;
  }

  closeMenuAfterLink(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest("a") !== null) {
      this.menuOpen.set(false);
    }
  }
}
