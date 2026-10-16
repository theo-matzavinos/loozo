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
  linkedSignal,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
  ɵOrigamiRovingFocus,
  ɵrequestMultipleSelection,
  ɵrequestSingleSelection,
} from "@loozo/origami-ui/collection";
import { OrigamiToggle, OrigamiToggleOptions } from "@loozo/origami-ui/toggle";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

/** Toggle Group axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiToggleGroupOrientation = "horizontal" | "vertical";

// Module-private so Options retain structural compatibility in packaged declarations.
const singleReplacement = new InjectionToken<OrigamiToggleGroupSingleOptions>(
  "Toggle Group Single replacement",
);
const multipleReplacement = new InjectionToken<OrigamiToggleGroupMultipleOptions>(
  "Toggle Group Multiple replacement",
);
const itemReplacement = new InjectionToken<OrigamiToggleGroupItemOptions>(
  "Toggle Group Item replacement",
);

/** Private mode-independent root configuration, aliased by each root to its own mode Options. */
const groupConfiguration = new InjectionToken<{
  readonly disabled: Signal<boolean>;
  readonly orientation: Signal<OrigamiToggleGroupOrientation>;
}>("Toggle Group configuration");

/** Effective Single configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToggleGroupSingleOptions {
  /**
   * Writable pressed value; the direct directive model defaults to null. Null or a value no item
   * has presses nothing and is never normalized. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /** Blocks every item's user activation and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;
  /** Whether activating the pressed item clears the value to null; default false, when it writes nothing. */
  abstract readonly deselectable: Signal<boolean>;

  /**
   * Replaces Single Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupSingleOptions>
      | AbstractType<OrigamiToggleGroupSingleOptions>,
  ): Provider[] {
    return [
      { provide: singleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToggleGroupSingleOptions, useExisting: singleReplacement },
    ];
  }

  /**
   * Replaces all Single Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply all four required signals.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupSingleOptions): Provider[] {
    return [
      { provide: singleReplacement, useFactory: factory },
      { provide: OrigamiToggleGroupSingleOptions, useExisting: singleReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () =>
      | Type<OrigamiToggleGroupSingleOptions>
      | AbstractType<OrigamiToggleGroupSingleOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToggleGroupSingleOptions,
        useFactory: () => {
          const replacement = inject(singleReplacement, {
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

/** Effective Multiple configuration; it has no Single `deselectable` policy. */
export abstract class OrigamiToggleGroupMultipleOptions {
  /**
   * Writable readonly-array pressed values; the direct directive model defaults to empty. Values
   * no item has persist in order; user activation writes new arrays. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<readonly string[]>;
  /** Blocks every item's user activation and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;

  /**
   * Replaces Multiple Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
  ): Provider[] {
    return [
      { provide: multipleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToggleGroupMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * Replaces all Multiple Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled and orientation.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupMultipleOptions): Provider[] {
    return [
      { provide: multipleReplacement, useFactory: factory },
      { provide: OrigamiToggleGroupMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToggleGroupMultipleOptions,
        useFactory: () => {
          const replacement = inject(multipleReplacement, {
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
 * Effective item configuration. It also drives the composed Collection Item and Toggle, so
 * replacing only these Options sets the item's Collection value, roving order and pressed and
 * disabled state without lower Options. The group reads every item's Options while rendering, so
 * replacement Options must be readable as soon as the item is constructed; a required input in a
 * repeated item can be read before Angular sets it (NG0950).
 */
export abstract class OrigamiToggleGroupItemOptions {
  /** The value this item presses in its group. */
  abstract readonly value: Signal<string>;
  /** Blocks this item's user activation and focus, combined with the root's disabled policy. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers; a directly matched item default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiToggleGroupItemOptions> | AbstractType<OrigamiToggleGroupItemOptions>,
  ): Provider[] {
    return [
      { provide: itemReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToggleGroupItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and disabled.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiToggleGroupItemOptions): Provider[] {
    return [
      { provide: itemReplacement, useFactory: factory },
      { provide: OrigamiToggleGroupItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiToggleGroupItemOptions> | AbstractType<OrigamiToggleGroupItemOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToggleGroupItemOptions,
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

abstract class Selection {
  abstract selected(value: string): boolean;
  abstract request(value: string, pressed: boolean): void;
}

@Service({ autoProvided: false })
class SingleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiToggleGroupSingleOptions);

  selected(value: string): boolean {
    return this.#options().value() === value;
  }

  request(value: string, pressed: boolean): void {
    const options = this.#options();

    ɵrequestSingleSelection(options.value, value, pressed, options.deselectable());
  }
}

@Service({ autoProvided: false })
class MultipleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiToggleGroupMultipleOptions);

  selected(value: string): boolean {
    return this.#options().value().includes(value);
  }

  request(value: string, pressed: boolean): void {
    ɵrequestMultipleSelection(this.#options().value, value, pressed);
  }
}

@Service({ autoProvided: false })
class ToggleGroupContext {
  readonly #configuration = injectDeferred(groupConfiguration);
  readonly #selection = injectDeferred(Selection);
  #destroyed = false;

  readonly disabled = computed(() => this.#configuration().disabled());
  readonly orientation = computed(() => this.#configuration().orientation());

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  selected(value: string): boolean {
    return this.#selection().selected(value);
  }

  /** A user press request; the caller has already applied its own disabled policy. */
  request(value: string, pressed: boolean): void {
    if (!this.#destroyed && !this.disabled()) {
      this.#selection().request(value, pressed);
    }
  }
}

@Service({ autoProvided: false })
class ToggleGroupItemContext {
  readonly #root = inject(ToggleGroupContext);
  readonly #item = injectDeferred(OrigamiToggleGroupItemOptions);
  #destroyed = false;

  readonly orientation = this.#root.orientation;
  readonly disabled = computed(() => this.#root.disabled() || this.#item().disabled());
  // Toggle writes become group requests; a rejected request writes nothing, so pressed state never runs ahead of the group.
  readonly pressed = linkedSignal(() => this.#root.selected(this.#item().value()), {
    set: (pressed) => {
      if (!this.#destroyed && !this.disabled()) {
        this.#root.request(this.#item().value(), pressed);
      }
    },
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }
}

/** Locally provided readonly facade for the nearest Single or Multiple root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiToggleGroupState {
  readonly #context = inject(ToggleGroupContext);

  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** Effective arrow-key axis. */
  readonly orientation: Signal<OrigamiToggleGroupOrientation> = this.#context.orientation;
}

/**
 * Single-pressed Toggle Group root: at most one item is pressed, and with `deselectable` the
 * pressed item can clear the value to null. Composes Collection so focus follows rendered DOM
 * order. While the value is null or no mounted item has it, nothing is pressed; the model is
 * never written without user action. Static `role="group"` (a consumer's static `role`
 * overrides it), `data-orientation` and `data-disabled` reflect effective Options; there is no
 * `aria-orientation`, which ARIA does not allow on `group`. Consumers own the accessible name,
 * item labels and styling. For radio semantics, where selection follows focus, this is not the
 * primitive.
 *
 * @example
 * ```html
 * <div ogToggleGroupSingle [(value)]="alignment" aria-label="Text alignment">
 *   <button ogToggleGroupItem value="start">Start</button>
 *   <button ogToggleGroupItem value="center">Center</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToggleGroupSingle]",
  exportAs: "ogToggleGroupSingle",
  hostDirectives: [OrigamiCollection],
  providers: [
    ToggleGroupContext,
    OrigamiToggleGroupState,
    ɵOrigamiRovingFocus,
    SingleSelection,
    { provide: Selection, useExisting: SingleSelection },
    OrigamiToggleGroupSingleOptions.ɵprovideDefault(() => OrigamiToggleGroupSingle),
    { provide: groupConfiguration, useExisting: OrigamiToggleGroupSingleOptions },
  ],
  host: {
    role: "group",
    "[attr.data-orientation]": "effectiveOrientation()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiToggleGroupSingle implements OrigamiToggleGroupSingleOptions {
  /**
   * Own pressed-value model, default null; `valueChange` emits user activations written to this
   * model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /**
   * Own clearing-policy input, default false with boolean-attribute coercion; replaced Options
   * supply effective policy instead. A pressed item that cannot clear stays an ordinary enabled
   * pressed button: activating it writes and emits nothing.
   */
  readonly deselectable = input(false, { transform: booleanAttribute });
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);

  readonly #context = inject(ToggleGroupContext);

  /** @internal Effective orientation host marker. */
  protected readonly effectiveOrientation = this.#context.orientation;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
}

/**
 * Multiple-pressed Toggle Group root: each item adds or removes its value. User activation
 * writes a new array that keeps every other value, including values no item has, in order, and
 * never mutates the caller's array; removing an item never prunes. Composes Collection so focus
 * follows rendered DOM order; the model is never written without user action. Static
 * `role="group"` (a consumer's static `role` overrides it), `data-orientation` and
 * `data-disabled` reflect effective Options; there is no `aria-orientation`. Consumers own the
 * accessible name, item labels and styling.
 *
 * @example
 * ```html
 * <div ogToggleGroupMultiple [(value)]="marks" aria-label="Text formatting">
 *   <button ogToggleGroupItem value="bold">Bold</button>
 *   <button ogToggleGroupItem value="italic">Italic</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToggleGroupMultiple]",
  exportAs: "ogToggleGroupMultiple",
  hostDirectives: [OrigamiCollection],
  providers: [
    ToggleGroupContext,
    OrigamiToggleGroupState,
    ɵOrigamiRovingFocus,
    MultipleSelection,
    { provide: Selection, useExisting: MultipleSelection },
    OrigamiToggleGroupMultipleOptions.ɵprovideDefault(() => OrigamiToggleGroupMultiple),
    { provide: groupConfiguration, useExisting: OrigamiToggleGroupMultipleOptions },
  ],
  host: {
    role: "group",
    "[attr.data-orientation]": "effectiveOrientation()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiToggleGroupMultiple implements OrigamiToggleGroupMultipleOptions {
  /**
   * Own readonly-array model, default empty; `valueChange` emits user activations written to
   * this model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<readonly string[]>([]);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);

  readonly #context = inject(ToggleGroupContext);

  /** @internal Effective orientation host marker. */
  protected readonly effectiveOrientation = this.#context.orientation;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
}

/**
 * A pressed button in the nearest Single or Multiple root, composed from Collection Item and
 * Toggle: Toggle supplies `type="button"`, always-present `aria-pressed`, native `disabled`,
 * `aria-disabled`, `data-pressed`, `data-disabled` and `OrigamiToggleState` for descendants,
 * all driven by the group. Do not also apply `ogToggle`. Click, Enter or Space requests a press
 * once under the root's policy; a rejected request writes nothing and leaves `aria-pressed`
 * unchanged. After Toggle's request, a click focuses the item if it is still mounted and enabled,
 * so it becomes the roving position in every engine; that focus never presses. Arrow keys along
 * the effective orientation (horizontal arrows follow reading direction), Home and End move focus
 * among enabled items in DOM order, wrapping at the ends, and never press. One enabled item is
 * the tab stop (`tabindex="0"`): the focused one, else the first pressed, else the first. Root or
 * own disabled state removes the item from navigation and blocks only user activation. If a
 * focused item is removed or disabled while focus has not moved elsewhere, focus moves to the new
 * tab stop without pressing. Requires a nearest Toggle Group root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogToggleGroupItem]",
  hostDirectives: [OrigamiCollectionItem, OrigamiToggle],
  providers: [
    ToggleGroupItemContext,
    OrigamiToggleGroupItemOptions.ɵprovideDefault(() => OrigamiToggleGroupItem),
    OrigamiCollectionItemOptions.provideFactory(() => inject(OrigamiToggleGroupItemOptions)),
    OrigamiToggleOptions.provideFactory(() => {
      const item = inject(ToggleGroupItemContext);

      return { pressed: item.pressed, disabled: item.disabled };
    }),
  ],
  host: {
    "[attr.tabindex]": "tabIndex()",
    "(click)": "clicked()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiToggleGroupItem implements OrigamiToggleGroupItemOptions {
  /**
   * Own value input, default opaque hydration-stable generated identity; give each item an
   * explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueId("toggle-group-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #context = inject(ToggleGroupItemContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #destroyed = false;

  readonly #focus = inject(ɵOrigamiRovingFocus).register({
    disabled: this.#context.disabled,
    preferred: this.#context.pressed,
    navigated: () => {},
  });

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop()) {
      return "0";
    }

    return "-1";
  });

  /** Resolves the nearest Toggle Group root synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal Not every engine focuses a clicked button, so a click focuses this item to make it
   * the roving position. Toggle's click listener has already requested the press; its output
   * listeners may have removed or disabled this item, so the guard reads live state.
   */
  protected clicked(): void {
    if (this.#destroyed || this.#context.disabled()) {
      return;
    }

    this.#element.focus();
  }

  /** @internal Arrow/Home/End navigation along the effective orientation. */
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
