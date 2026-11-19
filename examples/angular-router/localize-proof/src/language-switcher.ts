import { Component, LOCALE_ID, computed, inject } from "@angular/core";
import { injectActiveRoute } from "../generated/routes.generated.js";

const names: Record<string, string> = { en: "English", de: "Deutsch" };

// The README's switcher, with an id per link for the proof. Plain hrefs: each locale is its own
// Angular build, so a click is a document navigation.
@Component({
  selector: "proof-language-switcher",
  template: `
    <nav aria-label="Language">
      @for (link of links(); track link.locale) {
        <a
          [id]="'locale-' + link.locale"
          [href]="link.url"
          [attr.hreflang]="link.locale"
          [attr.aria-current]="link.current"
        >
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
