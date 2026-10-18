import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import { OrigamiToggle, OrigamiToggleOptions, OrigamiToggleState } from "@loozo/origami-ui/toggle";
import { ɵOrigamiToolbarControl } from "./toolbar-control";

/**
 * A Toggle that is one control in the nearest Toolbar, with the inputs, Options, State and press
 * rules of `OrigamiToggle` and the roving focus of `ogToolbarItem`: it shares the Toolbar's tab
 * stop and arrow sequence in DOM order, and moves never press. A click first requests the press,
 * then focuses the Toggle if it is still mounted and enabled or focusable, so it becomes the
 * roving position in every engine. Requires a nearest Toolbar; don't also apply `ogToggle` or
 * another button primitive.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <button ogToolbarItem (click)="undo()">Undo</button>
 *   <button ogToolbarToggle [(pressed)]="spellcheck">Spelling</button>
 * </div>
 * ```
 */
@Directive({
  selector: "button[ogToolbarToggle]",
  exportAs: "ogToolbarToggle",
  hostDirectives: [OrigamiToggle, ɵOrigamiToolbarControl],
  providers: [OrigamiToggleOptions.provideExisting(() => OrigamiToolbarToggle)],
})
export class OrigamiToolbarToggle implements OrigamiToggleOptions {
  /**
   * Own pressed model, default false; `pressedChange` emits writes to this model.
   * Replaced Options supply effective pressed state instead and do not fabricate this output.
   */
  readonly pressed = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Toggle focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** This Toggle's readonly effective Options observation, from its composed Toggle. */
  readonly state = inject(OrigamiToggleState);
}
