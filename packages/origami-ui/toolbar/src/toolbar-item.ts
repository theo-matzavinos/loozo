import { Directive, booleanAttribute, input } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { ɵOrigamiToolbarControl } from "./toolbar-control";

/**
 * A native `type="button"` control in the nearest Toolbar, composed from `ogButton`, with the
 * inputs and Options of `OrigamiButton`. Other controls read its Options only once it has
 * registered with the roving focus in `ngOnInit`, after Angular set its inputs, so replacement
 * Options may use required inputs. It keeps its own activation: Toolbar never clicks, and a click
 * focuses the item if it is still mounted and enabled or focusable, so it becomes the roving
 * position in every engine. Arrow keys along the Toolbar's orientation (horizontal arrows follow
 * reading direction), Home and End move focus among the Toolbar's controls in DOM order, wrapping
 * at the ends, and never activate. One control is the tab stop (`tabindex="0"`): the focused one,
 * else the first enabled one, else the first focusable disabled one. Disabled state sets
 * `aria-disabled` and `data-disabled` and native `disabled`, which removes the item from
 * navigation; with `focusableWhenDisabled` it stays in the arrow sequence and keeps focus, and the
 * consumer's own `(click)` listeners still run, so they check the disabled state themselves. If a
 * focused item is removed or natively disabled while focus has not moved elsewhere, focus moves
 * to the new tab stop without activating. Requires a nearest Toolbar. Don't apply another button
 * primitive to the same button: use `ogToolbarToggle` or `ogToolbarPopoverTrigger`, and don't
 * apply it to a ToggleGroup or RadioGroup item, which registers on its own.
 */
@Directive({
  selector: "button[ogToolbarItem]",
  hostDirectives: [OrigamiButton, ɵOrigamiToolbarControl],
  providers: [OrigamiButtonOptions.provideExisting(() => OrigamiToolbarItem)],
})
export class OrigamiToolbarItem implements OrigamiButtonOptions {
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled item focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
}
