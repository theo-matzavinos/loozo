import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  ɵOrigamiRovingFocus,
  ɵOrigamiRovingFocusScope,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

/** Toolbar axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiToolbarOrientation = "horizontal" | "vertical";

// Module-private so Options retain structural compatibility in packaged declarations.
const toolbarReplacement = new InjectionToken<OrigamiToolbarOptions>("Toolbar replacement");
const itemReplacement = new InjectionToken<OrigamiToolbarItemOptions>("Toolbar Item replacement");

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToolbarOptions {
  /** Arrow-key axis and `aria-orientation`, also for joined groups; default `horizontal`. */
  abstract readonly orientation: Signal<OrigamiToolbarOrientation>;

  /**
   * Replaces Toolbar Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () => Type<OrigamiToolbarOptions> | AbstractType<OrigamiToolbarOptions>,
  ): Provider[] {
    return [
      { provide: toolbarReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToolbarOptions, useExisting: toolbarReplacement },
    ];
  }

  /**
   * Replaces all Toolbar Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply orientation.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiToolbarOptions): Provider[] {
    return [
      { provide: toolbarReplacement, useFactory: factory },
      { provide: OrigamiToolbarOptions, useExisting: toolbarReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiToolbarOptions> | AbstractType<OrigamiToolbarOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToolbarOptions,
        useFactory: () => {
          const replacement = inject(toolbarReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(forwardRef(type));
        },
      },
    ];
  }
}

/**
 * Effective item configuration. The Toolbar reads every item's Options while rendering, so
 * replacement Options must be readable as soon as the item is constructed; a required input in a
 * repeated item can be read before Angular sets it (NG0950).
 */
export abstract class OrigamiToolbarItemOptions {
  /** Sets native `disabled` and removes the item from navigation. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers; a directly matched item default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiToolbarItemOptions> | AbstractType<OrigamiToolbarItemOptions>,
  ): Provider[] {
    return [
      { provide: itemReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToolbarItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply disabled.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiToolbarItemOptions): Provider[] {
    return [
      { provide: itemReplacement, useFactory: factory },
      { provide: OrigamiToolbarItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiToolbarItemOptions> | AbstractType<OrigamiToolbarItemOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToolbarItemOptions,
        useFactory: () => {
          const replacement = inject(itemReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(forwardRef(type));
        },
      },
    ];
  }
}

/** The Toolbar's roving focus and axis, shared with joined groups through the package-private scope. */
@Service({ autoProvided: false })
class ToolbarContext implements ɵOrigamiRovingFocusScope {
  readonly #options = injectDeferred(OrigamiToolbarOptions);

  readonly focus = inject(ɵOrigamiRovingFocus);
  readonly orientation = computed(() => this.#options().orientation());
}

/** Locally provided readonly facade for the nearest Toolbar; nested Toolbars have independent owners. */
@Service({ autoProvided: false })
export class OrigamiToolbarState {
  readonly #context = inject(ToolbarContext);

  /** Effective arrow-key axis, also used by joined groups. */
  readonly orientation: Signal<OrigamiToolbarOrientation> = this.#context.orientation;
}

/**
 * A row or column of controls with one tab stop: static `role="toolbar"` (a consumer's static
 * `role` overrides it), `aria-orientation` and `data-orientation` from effective Options. Composes
 * Collection so focus follows rendered DOM order. A ToggleGroup or RadioGroup root inside it, in
 * nearest logical DI, joins it: the group's items share the Toolbar's single tab stop and arrow
 * sequence and navigate along the Toolbar's orientation, moves never press or check, and the group
 * keeps its role, name and pressed or checked state.
 * A group inside Popover Content does not join. Other focusable content that is not an item keeps
 * its own Tab stop and its own arrow keys. Consumers own the accessible name, separators and
 * styling.
 *
 * @example
 * ```html
 * <div ogToolbar aria-label="Formatting">
 *   <button ogToolbarItem (click)="undo()">Undo</button>
 *   <div ogToggleGroupMultiple [(value)]="marks" aria-label="Text style">
 *     <button ogToggleGroupItem value="bold">Bold</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToolbar]",
  exportAs: "ogToolbar",
  hostDirectives: [OrigamiCollection],
  providers: [
    ToolbarContext,
    OrigamiToolbarState,
    ɵOrigamiRovingFocus,
    { provide: ɵOrigamiRovingFocusScope, useExisting: ToolbarContext },
    OrigamiToolbarOptions.ɵprovideDefault(() => OrigamiToolbar),
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

/**
 * A native `type="button"` control in the nearest Toolbar, composed with Collection Item. It
 * keeps its own activation: Toolbar never clicks, and a click focuses the item if it is still
 * mounted and enabled, so it becomes the roving position in every engine. Arrow keys along the
 * Toolbar's orientation (horizontal arrows follow reading direction), Home and End move focus among
 * enabled items and joined group items in DOM order, wrapping at the ends, and never activate.
 * One enabled control is the tab stop (`tabindex="0"`): the focused one, else the first. Own
 * disabled state sets native `disabled`, `aria-disabled` and `data-disabled` and removes the item
 * from navigation. If a focused item is removed or disabled while focus has not moved elsewhere,
 * focus moves to the new tab stop without activating. Requires a nearest Toolbar; do not also
 * apply it to a ToggleGroup or RadioGroup item, which joins on its own.
 */
@Directive({
  selector: "button[ogToolbarItem]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [OrigamiToolbarItemOptions.ɵprovideDefault(() => OrigamiToolbarItem)],
  host: {
    type: "button",
    "[disabled]": "effectiveDisabled()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "clicked()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiToolbarItem implements OrigamiToolbarItemOptions {
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiToolbarItemOptions);
  readonly #context = inject(ToolbarContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #destroyed = false;

  /** @internal Native disabled host binding. */
  protected readonly effectiveDisabled = computed(() => this.#options().disabled());

  readonly #focus = this.#context.focus.register({
    disabled: this.effectiveDisabled,
    preferred: computed(() => false),
    navigated: () => {},
  });

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop()) {
      return "0";
    }

    return "-1";
  });

  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = computed(() => {
    if (this.effectiveDisabled()) {
      return "true";
    }

    return null;
  });

  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.effectiveDisabled()) {
      return "";
    }

    return null;
  });

  /** Resolves the nearest Toolbar synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal Not every engine focuses a clicked button, so a click focuses this item to make it
   * the roving position. The consumer's own click listeners may have removed or disabled it, so
   * the guard reads live state.
   */
  protected clicked(): void {
    if (this.#destroyed || this.effectiveDisabled()) {
      return;
    }

    this.#element.focus();
  }

  /** @internal Arrow/Home/End navigation along the Toolbar's orientation. */
  protected keydown(event: KeyboardEvent): void {
    this.#focus.keydown(event, this.#context.orientation());
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected focused(): void {
    this.#focus.focus();
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected blurred(): void {
    this.#focus.blur();
  }
}
