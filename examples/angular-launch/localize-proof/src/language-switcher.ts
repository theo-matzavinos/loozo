import { Component, LOCALE_ID, computed, inject } from "@angular/core";
import { injectActiveRoute } from "../generated/routes.generated";

const names: Record<string, string> = { en: "English", de: "Deutsch" };

// Plain hrefs: each locale is its own Angular build, so a click is a document navigation.
// RouterLink would compose the URL under this build's base href.
@Component({
  selector: "app-language-switcher",
  template: `
    <nav aria-label="Language">
      @for (link of links(); track link.locale) {
        <a [href]="link.url" [attr.hreflang]="link.locale" [attr.aria-current]="link.current">
          {{ link.name }}
        </a>
      }
    </nav>
  `,
})
export class LanguageSwitcher {
  readonly #active = injectActiveRoute();
  readonly #locale = inject(LOCALE_ID);

  readonly links = computed(() => {
    const links = [];

    for (const { locale, url } of this.#active()?.localeUrls() ?? []) {
      let current: "page" | null = null;

      if (locale === this.#locale) {
        current = "page";
      }

      links.push({ locale, url, name: names[locale] ?? locale, current });
    }

    return links;
  });
}
