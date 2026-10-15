import { Component, DestroyRef, afterNextRender, inject, signal } from "@angular/core";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";

const storageKey = "loozo-docs-theme";

/**
 * Switches between light and dark and remembers the choice. index.html applies a stored choice
 * before the first paint; without one, CSS follows prefers-color-scheme.
 */
@Component({
  selector: "docs-theme-toggle",
  imports: [OrigamiToggle],
  template: `
    <button
      ogToggle
      class="theme-toggle"
      [pressed]="dark()"
      [disabled]="!known()"
      (pressedChange)="choose($event)"
    >
      Dark theme
    </button>
  `,
})
export class ThemeToggle {
  readonly dark = signal(false);
  /** The prerendered HTML can't know the theme, so the button stays disabled until the browser renders. */
  readonly known = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const query = matchMedia("(prefers-color-scheme: dark)");
      const update = () => {
        this.dark.set(this.isDark(query));
      };

      update();
      this.known.set(true);
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

  /** Only user activation emits; a system theme change updates `dark` without persisting it. */
  choose(dark: boolean) {
    let theme = "light";

    if (dark) {
      theme = "dark";
    }

    document.documentElement.dataset.theme = theme;
    this.dark.set(dark);

    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Storage can be unavailable; the choice then lasts for this page only.
    }
  }
}
