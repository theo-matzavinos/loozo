import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiSelect } from "@loozo/origami-ui/select";
import { cn } from "../cn";

/**
 * A single-choice list over Origami's Select: a SelectTrigger that shows the choice and a
 * SelectContent that floats its SelectOptions 4px below it. Write the Trigger's text from
 * `state.selectedOption()`, and give every option a `label`.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <span fold__FieldLabel>Status</span>
 *   <div fold__Select [formField]="form.status" #status="fold__Select">
 *     <button fold__SelectTrigger>{{ status.state.selectedOption()?.label ?? "Choose a status" }}</button>
 *     <div fold__SelectContent>
 *       <div fold__SelectOption value="draft" label="Draft">Draft</div>
 *       <div fold__SelectOption value="active" label="Active">Active</div>
 *     </div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[fold__Select]",
  exportAs: "fold__Select",
  hostDirectives: [
    {
      directive: OrigamiSelect,
      inputs: ["value", "open", "disabled"],
      outputs: ["valueChange", "openChange", "touch"],
    },
  ],
  host: { "data-slot": "select", "[class]": "classes()" },
})
export class Select {
  readonly class = input("");

  readonly #select = inject(OrigamiSelect);

  /** Origami's readonly observation: `value`, `open`, `disabled` and `selectedOption`. */
  readonly state = this.#select.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the Trigger. */
  focus(options?: FocusOptions): void {
    this.#select.focus(options);
  }

  protected readonly classes = computed(() => cn("block min-w-0", this.class()));
}
