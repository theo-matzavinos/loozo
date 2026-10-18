import {
  DestroyRef,
  Directive,
  ElementRef,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { ɵOrigamiRovingFocusContext } from "@loozo/origami-ui/collection";
import { OrigamiToggle, OrigamiToggleOptions, OrigamiToggleState } from "@loozo/origami-ui/toggle";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import { ToggleGroupContext } from "./toggle-group";

/**
 * Effective item configuration. It also drives the composed Toggle, so replacing only these
 * Options sets the item's pressed, disabled and focusable state without lower Options. Other items read it
 * only once the item has registered with the roving focus in `ngOnInit`, after Angular set its
 * inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiToggleGroupItemOptions {
  /** The value this item presses in its group. */
  abstract readonly value: Signal<string>;
  /**
   * Blocks this item's user activation, combined with the root's disabled policy; the disabled
   * item leaves the arrow sequence and the tab stop unless `focusableWhenDisabled`.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the item is disabled, by the root or its own Options, it stays focusable:
   * `aria-disabled="true"` and `data-disabled` without native `disabled`, and it stays in the
   * arrow sequence. Activation stays blocked, but the button's own `(click)` listeners still run.
   * Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToggleGroupItemOptions> | AbstractType<OrigamiToggleGroupItemOptions>,
  ): Provider {
    return { provide: OrigamiToggleGroupItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled and
   *   focusableWhenDisabled.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiToggleGroupItemOptions): Provider {
    return { provide: OrigamiToggleGroupItemOptions, useFactory: factory };
  }
}

@Service({ autoProvided: false })
class ToggleGroupItemContext {
  readonly #root = inject(ToggleGroupContext);
  readonly #item = injectDeferred(OrigamiToggleGroupItemOptions);
  #destroyed = false;

  readonly value = computed(() => this.#item().value());
  readonly disabled = computed(() => this.#root.disabled() || this.#item().disabled());
  readonly focusableWhenDisabled = computed(() => this.#item().focusableWhenDisabled());
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

/**
 * A pressed button in the nearest Toggle Group root, composed from Toggle: Toggle supplies
 * always-present `aria-pressed`, `data-pressed` and `OrigamiToggleState` for descendants, and its
 * composed `ogButton` `type="button"`, native `disabled`, `aria-disabled` and `data-disabled`, all
 * driven by the group. Do not also apply `ogToggle` or another button primitive. Click, Enter or Space requests a press
 * once under the root's policy; a rejected request writes nothing and leaves `aria-pressed`
 * unchanged. After Toggle's request, a click focuses the item if it is still mounted and enabled,
 * so it becomes the roving position in every engine; that focus never presses. Arrow keys along
 * the effective orientation (horizontal arrows follow reading direction), Home and End move focus
 * among enabled items in DOM order, wrapping at the ends, and never press. One item is the tab
 * stop (`tabindex="0"`): the focused one, else the first enabled pressed one, else the first
 * enabled one. In a
 * Toolbar Toggle Group the item belongs to the Toolbar's roving focus instead: it shares the
 * Toolbar's tab stop and arrow order along the Toolbar's orientation, and is never preferred.
 * Root or own disabled state blocks only user activation and removes the item from navigation,
 * unless `focusableWhenDisabled` keeps it in the arrow sequence and lets it keep focus; it is the
 * tab stop then only when it is focused or no item is enabled. If a focused item is removed or
 * natively disabled while focus has not moved elsewhere, focus moves to the new tab stop without
 * pressing. Requires a nearest Toggle Group root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogToggleGroupItem]",
  exportAs: "ogToggleGroupItem",
  hostDirectives: [OrigamiToggle],
  providers: [
    ToggleGroupItemContext,
    OrigamiToggleGroupItemOptions.provideExisting(() => OrigamiToggleGroupItem),
    OrigamiToggleOptions.provideFactory(() => {
      const item = inject(ToggleGroupItemContext);

      return {
        pressed: item.pressed,
        disabled: item.disabled,
        focusableWhenDisabled: item.focusableWhenDisabled,
      };
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
   * Own value input, default a generated value that hydration doesn't keep; give each item an
   * explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueValue("toggle-group-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled item focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /**
   * This item's readonly observation, from its composed Toggle: `pressed` follows the group's
   * value, and `disabled` is the item's effective disabled state, the root's or its own.
   */
  readonly state = inject(OrigamiToggleState);

  readonly #context = inject(ToggleGroupItemContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  readonly #focus = inject(ɵOrigamiRovingFocusContext);

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop() === this.#element) {
      return "0";
    }

    return "-1";
  });

  /** Resolves the nearest Toggle Group root synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this item for roving focus once Angular has set its inputs. */
  ngOnInit(): void {
    this.#focus.register(
      {
        element: this.#element,
        value: this.#context.value,
        disabled: this.#context.disabled,
        focusable: this.#context.focusableWhenDisabled,
      },
      this.#destroyRef,
    );
  }

  /**
   * @internal Not every engine focuses a clicked button, so a click focuses this item to make it
   * the roving position, also while it is disabled but focusable. Toggle's click listener has
   * already requested the press; its output listeners may have removed or disabled this item, so
   * the guard reads live state.
   */
  protected clicked(): void {
    if (this.#destroyed || (this.#context.disabled() && !this.#context.focusableWhenDisabled())) {
      return;
    }

    this.#element.focus();
  }

  /** @internal Arrow/Home/End navigation along the effective orientation. */
  protected keydown(event: KeyboardEvent): void {
    this.#focus.keydown(this.#element, event);
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected focused(): void {
    this.#focus.focus(this.#element);
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected blurred(): void {
    this.#focus.blur(this.#element);
  }
}
