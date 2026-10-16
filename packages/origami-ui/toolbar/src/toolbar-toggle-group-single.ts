import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import {
  OrigamiToggleGroupSingleOptions,
  OrigamiToggleGroupState,
  ɵOrigamiToggleGroupRoot,
} from "@loozo/origami-ui/toggle-group";
import type { OrigamiToggleGroupOrientation } from "@loozo/origami-ui/toggle-group";
import { ToolbarContext } from "./toolbar";

/**
 * A single-pressed Toggle Group inside a Toolbar, with the inputs, Options, State and press rules
 * of `OrigamiToggleGroupSingle`. Its `ogToggleGroupItem` items join the nearest Toolbar's roving
 * focus: they share the Toolbar's one tab stop and arrow sequence, navigate along the Toolbar's
 * orientation (its own `orientation` has no effect) and are never preferred; moves never press.
 * Requires a nearest Toolbar; outside one it fails through Angular DI.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <div ogToolbarToggleGroupSingle [(value)]="alignment" aria-label="Text alignment">
 *     <button ogToggleGroupItem value="start">Start</button>
 *     <button ogToggleGroupItem value="center">Center</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToolbarToggleGroupSingle]",
  exportAs: "ogToolbarToggleGroupSingle",
  hostDirectives: [ɵOrigamiToggleGroupRoot],
  providers: [
    OrigamiToggleGroupSingleOptions.ɵprovideRoot(
      () => OrigamiToolbarToggleGroupSingle,
      () => inject(ToolbarContext).orientation,
    ),
  ],
})
export class OrigamiToolbarToggleGroupSingle implements OrigamiToggleGroupSingleOptions {
  /**
   * Own pressed-value model, default null; `valueChange` emits user activations written to this
   * model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; it has no effect, since the Toolbar's orientation applies. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /**
   * Own clearing-policy input, default false with boolean-attribute coercion; replaced Options
   * supply effective policy instead. A pressed item that cannot clear stays an ordinary enabled
   * pressed button: activating it writes and emits nothing.
   */
  readonly deselectable = input(false, { transform: booleanAttribute });
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);

  /** Resolves the nearest Toolbar synchronously; outside a Toolbar it fails Angular DI clearly. */
  constructor() {
    inject(ToolbarContext);
  }
}
