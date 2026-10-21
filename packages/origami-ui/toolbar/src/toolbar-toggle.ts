import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import {
  OrigamiToggle,
  OrigamiToggleOptions,
  OrigamiToggleState,
  ɵOrigamiToggleNotFormControl,
} from "@loozo/origami-ui/toggle";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { ɵOrigamiToolbarControl } from "./toolbar-control";

/**
 * A Toggle that is one control in the nearest Toolbar, with the inputs, Options, State and press
 * rules of `OrigamiToggle` and the roving focus of `ogToolbarItem`: it shares the Toolbar's tab
 * stop and arrow sequence in DOM order, and moves never press. A click first requests the press,
 * then focuses the Toggle if it is still mounted and enabled or focusable, so it becomes the
 * roving position in every engine. It is not a form control: it never joins an `ogField` and
 * keeps a static `aria-describedby`. `[formField]` on it is unsupported: Signal Forms finds its
 * `checked` model and binds it, but it emits no `touch`, so the field is never marked touched.
 * Requires a nearest Toolbar; don't also apply `ogToggle` or another button primitive.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <button ogToolbarItem (click)="undo()">Undo</button>
 *   <button ogToolbarToggle [(checked)]="spellcheck">Spelling</button>
 * </div>
 * ```
 */
@Directive({
  selector: "button[ogToolbarToggle]",
  exportAs: "ogToolbarToggle",
  hostDirectives: [OrigamiToggle, ɵOrigamiToolbarControl],
  providers: [
    OrigamiToggleOptions.provideExisting(() => OrigamiToolbarToggle),
    { provide: ɵOrigamiToggleNotFormControl, useValue: true },
  ],
})
export class OrigamiToolbarToggle implements OrigamiToggleOptions {
  /**
   * Own checked (pressed) model, default false; `checkedChange` emits writes to this model.
   * Replaced Options supply effective checked state instead and do not fabricate this output.
   */
  readonly checked = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Toggle focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Static/bound IDs drive default Options; replacements supply the effective ID. */
  readonly id = input(injectUniqueId("toolbar-toggle"));
  /** This Toggle's readonly effective Options observation, from its composed Toggle. */
  readonly state = inject(OrigamiToggleState);
}
