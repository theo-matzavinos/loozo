import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleOptions,
  OrigamiCollapsibleState,
  type OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";

/**
 * Shows and hides one Panel from one Trigger: `[(expanded)]`, `disabled` (blocks the trigger and
 * find-in-page), `hiding="hidden"` to opt out of find-in-page. Any element can be the root.
 */
@Directive({
  selector: "[fold__Collapsible]",
  exportAs: "fold__Collapsible",
  hostDirectives: [OrigamiCollapsible],
  providers: [OrigamiCollapsibleOptions.provideExisting(() => Collapsible)],
  host: { "data-slot": "collapsible" },
})
export class Collapsible implements OrigamiCollapsibleOptions {
  readonly expanded = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly hiding = input<OrigamiCollapsibleHiding>("until-found");
  /** Origami's readonly observation: `expanded` and `disabled` (the root's, not the Trigger's). */
  readonly state = inject(OrigamiCollapsibleState);
}
