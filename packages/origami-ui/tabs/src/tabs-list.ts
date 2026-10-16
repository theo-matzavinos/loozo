import { Directive, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { TabsContext } from "./tabs";
import type { OrigamiTabsOrientation } from "./tabs";

/**
 * The Triggers' container: static `role="tablist"` and `aria-orientation` from effective
 * Options. The consumer supplies its accessible name with `aria-label` or `aria-labelledby`.
 * Requires a nearest Tabs root.
 */
@Directive({
  selector: "[ogTabsList]",
  host: {
    role: "tablist",
    "[attr.aria-orientation]": "orientation()",
  },
})
export class OrigamiTabsList {
  /** @internal Effective `aria-orientation`. */
  protected readonly orientation: Signal<OrigamiTabsOrientation> = inject(TabsContext).orientation;
}
