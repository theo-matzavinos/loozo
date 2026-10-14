import { Component, DestroyRef, afterNextRender, inject, signal } from "@angular/core";

const storageKey = "loozo-docs-theme";

/**
 * Switches between light and dark and remembers the choice. index.html applies a stored choice
 * before the first paint; without one, CSS follows prefers-color-scheme.
 */
@Component({
  selector: "docs-theme-toggle",
  template: `
    <button type="button" class="theme-toggle" [attr.aria-pressed]="dark()" (click)="toggle()">
      Dark theme
    </button>
  `,
})
export class ThemeToggle {
  /** Unknown until the browser renders, because the prerendered HTML can't know the theme. */
  readonly dark = signal<boolean | undefined>(undefined);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const query = matchMedia("(prefers-color-scheme: dark)");
      const update = () => {
        this.dark.set(this.isDark(query));
      };

      update();
      query.addEventListener("change", update);
      destroyRef.onDestroy(() => {
        query.removeEventListener("change", update);
      });
    });
  }

  isDark(query: MediaQueryList) {
    const theme = document.documentElement.dataset.theme;

    if (theme === undefined) {
      return query.matches;
    }

    return theme === "dark";
  }

  toggle() {
    let theme = "dark";

    if (this.dark()) {
      theme = "light";
    }

    document.documentElement.dataset.theme = theme;
    this.dark.set(theme === "dark");

    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Storage can be unavailable; the choice then lasts for this page only.
    }
  }
}
