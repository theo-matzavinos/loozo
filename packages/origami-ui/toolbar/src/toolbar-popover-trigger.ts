import { Directive, booleanAttribute, input } from "@angular/core";
import { OrigamiPopoverTrigger, OrigamiPopoverTriggerOptions } from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { ɵOrigamiToolbarControl } from "./toolbar-control";

/**
 * A Popover Trigger that is one control in the nearest Toolbar, with the inputs, Options and
 * behavior of `OrigamiPopoverTrigger` and the roving focus of `ogToolbarItem`: it shares the
 * Toolbar's tab stop and arrow sequence in DOM order, and moves never open the Popover. Its
 * disabled state in the Toolbar is the Trigger's own: the Popover's or its own disabled, so
 * disabling the Popover root also takes it out of the arrow sequence unless
 * `focusableWhenDisabled`. Requires a nearest Toolbar and a nearest Popover; don't also apply
 * `ogPopoverTrigger` or another button primitive. It may share its button with `ogPopoverAnchor`.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <div ogPopover>
 *     <button ogToolbarPopoverTrigger ogPopoverAnchor>Colour</button>
 *     <div ogPopoverContent>…</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "button[ogToolbarPopoverTrigger]",
  hostDirectives: [OrigamiPopoverTrigger, ɵOrigamiToolbarControl],
  providers: [OrigamiPopoverTriggerOptions.provideExisting(() => OrigamiToolbarPopoverTrigger)],
})
export class OrigamiToolbarPopoverTrigger implements OrigamiPopoverTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Static/bound IDs drive default Options; replacements supply the effective ID. */
  readonly id = input(injectUniqueId("toolbar-popover-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
}
