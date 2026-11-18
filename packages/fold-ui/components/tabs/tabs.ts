import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiTabs } from "@loozo/origami-ui/tabs";
import { cn } from "../cn";

/**
 * Text tabs over Origami's Tabs: a TabsList of TabsTriggers on a 1px baseline, and a TabsPanel
 * per Trigger. Origami owns the selection, roving focus and server rendering; the value is yours.
 * `orientation="vertical"` puts the List beside the Panels, with its baseline on its inline end.
 *
 * @example
 * ```html
 * <section fold__Tabs [(value)]="view">
 *   <div fold__TabsList aria-label="Contract lists">
 *     <button fold__TabsTrigger value="all">All contracts</button>
 *     <button fold__TabsTrigger value="drafts">Drafts</button>
 *   </div>
 *   <div fold__TabsPanel value="all">…</div>
 *   <div fold__TabsPanel value="drafts">…</div>
 * </section>
 * ```
 */
@Directive({
  selector: "[fold__Tabs]",
  exportAs: "fold__Tabs",
  hostDirectives: [
    {
      directive: OrigamiTabs,
      inputs: ["value", "disabled", "orientation", "activation"],
      outputs: ["valueChange"],
    },
  ],
  host: { "data-slot": "tabs", "[class]": "classes()" },
})
export class Tabs {
  readonly class = input("");

  /** Origami's readonly observation: `value`, `disabled`, `orientation` and `activation`. */
  readonly state = inject(OrigamiTabs).state;

  protected readonly classes = computed(() =>
    cn(
      "flex min-w-0 flex-col gap-4 data-[orientation=vertical]:flex-row data-[orientation=vertical]:gap-5",
      this.class(),
    ),
  );
}
