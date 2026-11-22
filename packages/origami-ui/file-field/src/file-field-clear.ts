import { Directive, computed, inject, untracked } from "@angular/core";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { FileFieldContext } from "./file-field-context";

/**
 * Whether Angular is replaying a click that reached the server-rendered Clear before it hydrated:
 * eager hydration's replay marks it `EventPhase.REPLAY`; incremental hydration's calls the
 * listeners with the browser's event after its dispatch has ended, in phase `NONE`.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
}

/**
 * A button that empties its file field: activating it writes null through the root's value, so
 * `[formField]` and `valueChange` receive null and the Input's native `files` is emptied after the
 * next render, letting the user choose the same file again; then it moves focus to the mounted
 * Input, synchronously, before that render removes the Clear, as it usually does. Composes
 * `ogButton`, so it is a native `type="button"`. It has no inputs: natively disabled while the
 * field is, with `aria-disabled="true"` and `data-disabled`, and a disabled field's Clear writes
 * and focuses nothing. Activated while the field is already empty, it writes nothing and only
 * moves focus. Requires a nearest file field root; any number may be mounted.
 *
 * Touch: activating it emits no `touch`; a pick, a drop or leaving the Input touch the field as
 * usual, so after a pick an emptied required field shows its error at once, and moving focus from
 * the Input to the Clear touches through the Input's blur.
 *
 * Placement: inside the root and outside any `<label>`: a label holds only its own control, and a
 * Clear inside the Input's label could take its name. The consumer supplies its accessible name,
 * such as `aria-label="Remove the invoice"`, and its content, and usually renders it only while a
 * file is chosen. If the value becomes null another way while it has focus, removing it loses
 * focus: move focus with the root's `focus()`. Don't apply `ogButton` or another button primitive
 * to the same button.
 *
 * Hydration: a click Angular replays, made before the Clear hydrated, does nothing: the field
 * ends as the Input's adoption leaves it, and focus stays where the user moved it.
 *
 * @example
 * ```html
 * <div ogFileField [formField]="billing.invoice" #picker="ogFileField">
 *   <label ogFileFieldDropZone class="zone">
 *     Choose a file <input ogFileFieldInput class="sr-only" />
 *   </label>
 *   @if (picker.state.value(); as file) {
 *     <p>{{ file.name }}</p>
 *     <button ogFileFieldClear aria-label="Remove the invoice">×</button>
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "button[ogFileFieldClear]",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiButtonOptions.provideFactory(() => {
      const context = inject(FileFieldContext);

      return { disabled: context.disabled, focusableWhenDisabled: computed(() => false) };
    }),
  ],
  host: { "(click)": "clicked($event)" },
})
export class OrigamiFileFieldClear {
  readonly #context = inject(FileFieldContext);

  /**
   * @internal A genuine activation of an enabled field empties it without touching and focuses
   * the Input; a replayed click reports one made before hydration.
   */
  protected clicked(event: Event): void {
    if (replayed(event) || untracked(this.#context.disabled)) {
      return;
    }

    this.#context.select(null, { touch: false });
    this.#context.focus();
  }
}
