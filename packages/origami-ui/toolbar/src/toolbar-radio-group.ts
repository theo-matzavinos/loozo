import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import {
  OrigamiRadioGroupOptions,
  OrigamiRadioGroupState,
  ɵOrigamiRadioGroupRoot,
} from "@loozo/origami-ui/radio-group";
import { ToolbarContext } from "./toolbar";

/**
 * A Radio Group inside a Toolbar, with the inputs, Options, State and checking rules of
 * `OrigamiRadioGroup`. Its `ogRadioGroupItem` items join the nearest Toolbar's roving focus:
 * they share the Toolbar's one tab stop and arrow sequence, navigate along the Toolbar's
 * orientation and are never preferred; moves only move focus and never check. Click, Enter and
 * Space still check. Requires a nearest Toolbar; outside one it fails through Angular DI.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <div ogToolbarRadioGroup [(value)]="alignment" aria-label="Text alignment">
 *     <button ogRadioGroupItem value="left">Left</button>
 *     <button ogRadioGroupItem value="center">Center</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToolbarRadioGroup]",
  exportAs: "ogToolbarRadioGroup",
  hostDirectives: [ɵOrigamiRadioGroupRoot],
  providers: [OrigamiRadioGroupOptions.provideExisting(() => OrigamiToolbarRadioGroup)],
})
export class OrigamiToolbarRadioGroup implements OrigamiRadioGroupOptions {
  /**
   * Own checked-value model, default null; `valueChange` emits user selections written to this
   * model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiRadioGroupState);

  /** Resolves the nearest Toolbar synchronously; outside a Toolbar it fails Angular DI clearly. */
  constructor() {
    inject(ToolbarContext);
  }
}
