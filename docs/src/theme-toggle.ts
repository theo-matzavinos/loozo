import { Component, DestroyRef, afterNextRender, inject, signal } from "@angular/core";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

const storageKey = "loozo-docs-theme";

/**
 * Switches between light and dark and remembers the choice. index.html applies a stored choice
 * before the first paint; without one, CSS follows prefers-color-scheme. The button is icon-only:
 * its name comes from aria-label, and the Tooltip adds a description instead of repeating it.
 */
@Component({
  selector: "docs-theme-toggle",
  imports: [OrigamiToggle, OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <span ogTooltip>
      <button
        ogToggle
        ogTooltipTrigger
        class="theme-toggle"
        aria-label="Dark theme"
        [checked]="dark()"
        [disabled]="!known()"
        (checkedChange)="choose($event)"
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" />
        </svg>
      </button>
      <span ogTooltipContent class="tooltip" side="block-end" align="end" [gap]="6"
        >Switch between light and dark</span
      >
    </span>
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
