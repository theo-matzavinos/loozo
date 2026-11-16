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
import { destination as guide } from "./guide/$guide/destination.generated.js";
import { destination as overview } from "./+overview/destination.generated.js";
import { destination as generatedApi } from "./generated-api/destination.generated.js";

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
        <h2 class="sidebar-heading">Packages</h2>
        <ul class="sidebar-packages">
          @for (item of packages; track item.slug) {
            <li>
              <!-- Marks the package being read on all its pages; the page itself gets "active". -->
              <a
                [routerLink]="item.link"
                [attr.aria-current]="item.slug === route.params().package ? 'true' : null"
                >{{ item.name }}</a
              >
            </li>
          }
        </ul>
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
          @if (sections.apiIndex; as index) {
            <h2 class="sidebar-heading">API</h2>
            <ul>
              <!-- No active state: it's the overview page, which shares its URL with the package link. -->
              <li><a [routerLink]="index">Index</a></li>
              @for (entry of sections.entryGuides; track entry.slug) {
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
          @if (sections.generatedApi; as link) {
            <h2 class="sidebar-heading">Generated code</h2>
            <ul>
              <li>
                <a [routerLink]="link" routerLinkActive="active" ariaCurrentWhenActive="page"
                  >Generated API</a
                >
              </li>
            </ul>
          }
        }
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
      const link = this.route.link({
        to: guide,
        params: { package: params.package, guide: page.slug },
      });

      guides.push({ slug: page.slug, title: page.title, link });
    }

    // Symbols are listed in the overview's API index, not here.
    let apiIndex = null;

    if (content.entryPoints.length > 0) {
      apiIndex = this.route.link({
        to: overview,
        params: { package: params.package },
        fragment: "api",
      });
    }

    const entryGuides = [];

    for (const entryPoint of content.entryPoints) {
      if (entryPoint.guide !== null) {
        const link = this.route.link({
          to: guide,
          params: { package: params.package, guide: entryPoint.guide.slug },
        });

        entryGuides.push({ slug: entryPoint.guide.slug, title: entryPoint.guide.title, link });
      }
    }

    let generatedApiLink = null;

    if (content.generatedApi.length > 0) {
      generatedApiLink = this.route.link({ to: generatedApi, params: { package: params.package } });
    }

    return { guides, apiIndex, entryGuides, generatedApi: generatedApiLink };
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
