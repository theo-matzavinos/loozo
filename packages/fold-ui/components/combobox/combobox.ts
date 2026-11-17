import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiCombobox } from "@loozo/origami-ui/combobox";
import { cn } from "../cn";

/**
 * A searchable single-choice list over Origami's Combobox: a ComboboxInput with Input's look, an
 * optional ComboboxTrigger chevron laid over its end, and a ComboboxContent that floats the
 * options you filter by `query` 4px below the input. Writing `value` from outside doesn't change
 * the text; write `query` too.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <label fold__FieldLabel>Planet</label>
 *   <div fold__Combobox [formField]="form.planet" [(query)]="planetQuery">
 *     <input fold__ComboboxInput placeholder="Search planets" />
 *     <button fold__ComboboxTrigger aria-label="All planets"></button>
 *     <div fold__ComboboxContent>
 *       @for (planet of planets(); track planet.id) {
 *         <div fold__ComboboxOption [value]="planet.id" [label]="planet.name">{{ planet.name }}</div>
 *       } @empty {
 *         <p fold__ComboboxEmpty>No planet matches.</p>
 *       }
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__Combobox]",
  exportAs: "fold__Combobox",
  hostDirectives: [
    {
      directive: OrigamiCombobox,
      inputs: ["value", "query", "open", "disabled"],
      outputs: ["valueChange", "queryChange", "openChange", "touch"],
    },
  ],
  host: { "data-slot": "combobox", "[class]": "classes()" },
})
export class Combobox {
  readonly class = input("");

  readonly #combobox = inject(OrigamiCombobox);

  /** Origami's readonly observation: `value`, `query`, `open` and `disabled`. */
  readonly state = this.#combobox.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the input. */
  focus(options?: FocusOptions): void {
    this.#combobox.focus(options);
  }

  // Relative, so the Trigger can sit over the input's end.
  protected readonly classes = computed(() => cn("relative block min-w-0", this.class()));
}
