import { Directive, Service, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

/**
 * The roving value a Toolbar control registers while focus is inside its own Content, and
 * the Toolbar's only preferred value, so that control keeps the tab stop while no control has focus.
 */
export const contentFocusValue = "ɵorigami-toolbar-content-focus";

/** Toolbar axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiToolbarOrientation = "horizontal" | "vertical";

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToolbarOptions {
  /** Arrow-key axis and `aria-orientation`, also for Toolbar groups; default `horizontal`. */
  abstract readonly orientation: Signal<OrigamiToolbarOrientation>;

  /**
   * Replaces Toolbar Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToolbarOptions> | AbstractType<OrigamiToolbarOptions>,
  ): Provider {
    return { provide: OrigamiToolbarOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Toolbar Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply orientation.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiToolbarOptions): Provider {
    return { provide: OrigamiToolbarOptions, useFactory: factory };
  }
}

/** The Toolbar's axis, read by its items and Toolbar groups; a Toolbar group fails DI without it. */
@Service({ autoProvided: false })
export class ToolbarContext {
  readonly #options = injectDeferred(OrigamiToolbarOptions);

  readonly orientation = computed(() => this.#options().orientation());
}

/** Locally provided readonly facade for the nearest Toolbar; nested Toolbars have independent owners. */
@Service({ autoProvided: false })
export class OrigamiToolbarState {
  readonly #context = inject(ToolbarContext);

  /** Effective arrow-key axis, also used by Toolbar groups. */
  readonly orientation: Signal<OrigamiToolbarOrientation> = this.#context.orientation;
}

/**
 * A row or column of controls with one tab stop: static `role="toolbar"` (a consumer's static
 * `role` overrides it), `aria-orientation` and `data-orientation` from effective Options. Its
 * controls (`OrigamiToolbarItem`, `OrigamiToolbarToggle`, `OrigamiToolbarPopoverTrigger`) and
 * the items of the Toolbar groups inside it (`OrigamiToolbarToggleGroupSingle`,
 * `OrigamiToolbarToggleGroupMultiple`, `OrigamiToolbarRadioGroup`) share its one tab stop, held
 * by the focused control, else the first enabled one, else the first focusable disabled one, and
 * its arrow sequence in rendered DOM order along its orientation; moves never activate, press or
 * check, and each group keeps its role, name and pressed or checked state. A standalone ToggleGroup or RadioGroup inside it keeps its own tab
 * stop, as does other focusable content that is not an item. Consumers own the accessible name,
 * separators and styling.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <button ogToolbarItem (click)="undo()">Undo</button>
 *   <div ogToolbarToggleGroupMultiple [(value)]="marks" aria-label="Text style">
 *     <button ogToggleGroupItem value="bold">Bold</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToolbar]",
  exportAs: "ogToolbar",
  providers: [
    ToolbarContext,
    OrigamiToolbarState,
    ɵOrigamiRovingFocusContext,
    ɵOrigamiRovingFocusOptions.provideFactory(() => ({
      orientation: inject(ToolbarContext).orientation,
      preferred: computed<readonly string[]>(() => [contentFocusValue]),
    })),
    OrigamiToolbarOptions.provideExisting(() => OrigamiToolbar),
  ],
  host: {
    role: "toolbar",
    "[attr.aria-orientation]": "effectiveOrientation()",
    "[attr.data-orientation]": "effectiveOrientation()",
  },
})
export class OrigamiToolbar implements OrigamiToolbarOptions {
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiToolbarOrientation>("horizontal");
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToolbarState);

  /** @internal Effective orientation host marker and `aria-orientation`. */
  protected readonly effectiveOrientation = inject(ToolbarContext).orientation;
}
