import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import {
  OrigamiToggleGroupMultipleOptions,
  OrigamiToggleGroupState,
  ɵOrigamiToggleGroupRoot,
} from "@loozo/origami-ui/toggle-group";
import type { OrigamiToggleGroupOrientation } from "@loozo/origami-ui/toggle-group";
import { ToolbarContext } from "./toolbar";

/**
 * A multiple-pressed Toggle Group inside a Toolbar, with the inputs, Options, State and press
 * rules of `OrigamiToggleGroupMultiple`. Its `ogToggleGroupItem` items join the nearest Toolbar's
 * roving focus: they share the Toolbar's one tab stop and arrow sequence, navigate along the
 * Toolbar's orientation (its own `orientation` has no effect) and are never preferred; moves
 * never press.
 * It is not a form control: it never joins an `ogField` and has no `touch` output or `focus()`
 * method. `[formField]` on it is unsupported: Signal Forms finds its `value` model and binds it,
 * but the field is never marked touched and `focusBoundControl()` focuses nothing.
 * Requires a nearest Toolbar; outside one it fails through Angular DI.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <div ogToolbarToggleGroupMultiple [(value)]="marks" aria-label="Text style">
 *     <button ogToggleGroupItem value="bold">Bold</button>
 *     <button ogToggleGroupItem value="italic">Italic</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToolbarToggleGroupMultiple]",
  exportAs: "ogToolbarToggleGroupMultiple",
  hostDirectives: [ɵOrigamiToggleGroupRoot],
  providers: [
    OrigamiToggleGroupMultipleOptions.ɵprovideRoot(
      () => OrigamiToolbarToggleGroupMultiple,
      () => inject(ToolbarContext).orientation,
    ),
  ],
})
export class OrigamiToolbarToggleGroupMultiple implements OrigamiToggleGroupMultipleOptions {
  /**
   * Own readonly-array model, default empty; `valueChange` emits user activations written to
   * this model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<readonly string[]>([]);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; it has no effect, since the Toolbar's orientation applies. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);

  /** Resolves the nearest Toolbar synchronously; outside a Toolbar it fails Angular DI clearly. */
  constructor() {
    inject(ToolbarContext);
  }
}
