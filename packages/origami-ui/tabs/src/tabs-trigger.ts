import {
  DestroyRef,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { ɵOrigamiRovingFocusContext } from "@loozo/origami-ui/collection";
import { injectDeferred, injectUniqueId, injectUniqueValue } from "@loozo/origami-ui/utils";
import { TabsContext } from "./tabs";

/**
 * Effective Trigger configuration. Other parts read it only once the Trigger has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiTabsTriggerOptions {
  /** The value this Trigger selects and pairs with the Panel of the same value. */
  abstract readonly value: Signal<string>;
  /** Effective DOM ID, named by the mounted Panel's `aria-labelledby`. */
  abstract readonly id: Signal<string>;
  /**
   * Blocks this Trigger's user selection, combined with the root's disabled policy; the disabled
   * Trigger leaves the arrow sequence and the tab stop unless `focusableWhenDisabled`.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Trigger is disabled, by the root or its own Options, it stays focusable:
   * `aria-disabled="true"` and `data-disabled` without native `disabled`, and it stays in the
   * arrow sequence, where automatic activation focuses it without selecting it. Activation stays
   * blocked, but the button's own `(click)` listeners still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Replaces Trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsTriggerOptions> | AbstractType<OrigamiTabsTriggerOptions>,
  ): Provider {
    return { provide: OrigamiTabsTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Trigger Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, id, disabled and
   *   focusableWhenDisabled.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiTabsTriggerOptions): Provider {
    return { provide: OrigamiTabsTriggerOptions, useFactory: factory };
  }
}

/**
 * A native `type="button"` with `role="tab"`. Click, Enter or
 * Space focuses it and selects its value once if it is still mounted and enabled after its focus
 * handlers ran; selecting the selected tab writes nothing and there is no deselection. Arrow keys along the effective orientation (horizontal arrows follow
 * reading direction), Home and End move focus among enabled Triggers in DOM order, wrapping at
 * the ends; with automatic activation the Trigger a move focuses is selected if it is still
 * mounted, enabled and focused after its focus handlers ran. Other focus never selects. One
 * Trigger is the tab stop (`tabindex="0"`): the focused one, else the first enabled selected one,
 * else the first enabled one. Root or own disabled state makes the composed `ogButton` set native `disabled`,
 * `aria-disabled` and `data-disabled`, and removes the Trigger from navigation; with
 * `focusableWhenDisabled` it has no native `disabled`, stays in the arrow sequence and keeps
 * focus, is the tab stop only when focused or when no Trigger is enabled, and is never selected
 * by a click or move. A disabled selected Trigger stays `aria-selected`. `aria-controls` names
 * only a mounted Panel of the same value. If a focused Trigger is removed or natively disabled
 * while focus has not moved elsewhere, focus moves to the new tab stop without selecting. Requires a nearest Tabs root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogTabsTrigger]",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiTabsTriggerOptions.provideExisting(() => OrigamiTabsTrigger),
    OrigamiButtonOptions.provideFactory(() => {
      const trigger = inject(OrigamiTabsTriggerOptions);
      const context = inject(TabsContext);

      return {
        disabled: computed(() => context.disabled() || trigger.disabled()),
        focusableWhenDisabled: trigger.focusableWhenDisabled,
      };
    }),
  ],
  host: {
    role: "tab",
    "[id]": "effectiveId()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-selected]": "selected()",
    "[attr.aria-controls]": "panelId()",
    "[attr.data-selected]": "selectedAttribute()",
    "(click)": "activate()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiTabsTrigger implements OrigamiTabsTriggerOptions {
  /**
   * Own value input, default a generated value that pairs with nothing; give each
   * Trigger and its Panel the same explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueValue("tabs-trigger-value"));
  /** Own ID input, default opaque hydration-stable generated identity; replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("tabs-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiTabsTriggerOptions);
  readonly #context = inject(TabsContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** Combined root and own disabled policy. */
  readonly #effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  readonly #focusable = computed(() => this.#options().focusableWhenDisabled());
  /** @internal Selection ARIA observation, always `true` or `false`. */
  protected readonly selected = computed(() => this.#context.value() === this.#options().value());
  /** @internal Mounted-only control association. */
  protected readonly panelId = computed(() => this.#context.panelId(this.#options().value()));

  readonly #focus = inject(ɵOrigamiRovingFocusContext);

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop() === this.#element) {
      return "0";
    }

    return "-1";
  });

  /** @internal Selected host marker. */
  protected readonly selectedAttribute = computed(() => {
    if (this.selected()) {
      return "";
    }

    return null;
  });

  /** Resolves the nearest Tabs root synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this Trigger once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerTrigger(this.#options, this.#destroyRef);
    this.#focus.register(
      {
        element: this.#element,
        value: computed(() => this.#options().value()),
        disabled: this.#effectiveDisabled,
        focusable: this.#focusable,
      },
      this.#destroyRef,
    );
  }

  /**
   * @internal Live native activation request, obeying effective disabled Options. Not every
   * engine focuses a clicked button, so activation focuses this Trigger to make it the roving
   * position, also while it is disabled but focusable; that focus never selects. Its focus
   * handlers may remove or disable this Trigger, so the guard runs again once focus returns.
   */
  protected activate(): void {
    if (this.#destroyed || (this.#effectiveDisabled() && !this.#focusable())) {
      return;
    }

    this.#element.focus();

    if (!this.#selectable()) {
      return;
    }

    this.#context.select(this.#options().value());
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

  /** Live activation guard: mounted and not disabled by the root or its own Options. */
  #selectable(): boolean {
    return !this.#destroyed && !this.#effectiveDisabled();
  }
}
