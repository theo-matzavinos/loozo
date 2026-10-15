import {
  DestroyRef,
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";

const toggleReplacement = new InjectionToken<OrigamiToggleOptions>("Toggle replacement");

/** Effective Toggle configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToggleOptions {
  /** Writable pressed intent; the direct directive model defaults to false. External writes remain authoritative. */
  abstract readonly pressed: WritableSignal<boolean>;
  /** Blocks user activation, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Toggle Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () => Type<OrigamiToggleOptions> | AbstractType<OrigamiToggleOptions>,
  ): Provider[] {
    return [
      { provide: toggleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToggleOptions, useExisting: toggleReplacement },
    ];
  }

  /**
   * Replaces all Toggle Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply both required signals.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleOptions): Provider[] {
    return [
      { provide: toggleReplacement, useFactory: factory },
      { provide: OrigamiToggleOptions, useExisting: toggleReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiToggleOptions> | AbstractType<OrigamiToggleOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToggleOptions,
        useFactory: () => {
          const replacement = inject(toggleReplacement, {
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

@Service({ autoProvided: false })
class ToggleContext {
  readonly #options = injectDeferred(OrigamiToggleOptions);
  #destroyed = false;

  readonly pressed = computed(() => this.#options().pressed());
  readonly disabled = computed(() => this.#options().disabled());

  readonly pressedAttribute = computed(() => {
    if (this.pressed()) {
      return "";
    }

    return null;
  });

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  readonly disabledAria = computed(() => {
    if (this.disabled()) {
      return "true";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  toggle(): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    this.#options().pressed.set(!this.pressed());
  }
}

/** Locally provided readonly facade for its Toggle; each Toggle element has an independent owner. */
@Service({ autoProvided: false })
export class OrigamiToggleState {
  readonly #context = inject(ToggleContext);

  /** Effective pressed state. No writable mutation alias is exposed. */
  readonly pressed: Signal<boolean> = this.#context.pressed;
  /** Effective disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * A two-state button: native `type="button"` activation flips effective pressed state exactly once.
 * Enter/Space retain native button semantics; no custom keyboard handler is supplied.
 * Disabled user actions cannot write pressed state. `aria-pressed`, native `disabled`,
 * `aria-disabled`, `data-pressed` and `data-disabled` reflect effective substituted Options.
 * Consumers own the accessible name, label/icon changes, styling and any side effects.
 * Not a form control: it has no Signal Forms integration, group or roving focus.
 * @example
 * ```html
 * <button ogToggle [(pressed)]="muted">Mute</button>
 * ```
 */
@Directive({
  selector: "button[ogToggle]",
  exportAs: "ogToggle",
  providers: [
    ToggleContext,
    OrigamiToggleState,
    OrigamiToggleOptions.ɵprovideDefault(() => OrigamiToggle),
  ],
  host: {
    type: "button",
    "[disabled]": "effectiveDisabled()",
    "[attr.aria-pressed]": "effectivePressed()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-pressed]": "pressedAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
  },
})
export class OrigamiToggle implements OrigamiToggleOptions {
  /**
   * Own pressed model, default false; `pressedChange` emits writes to this model.
   * Replaced Options supply effective pressed state instead and do not fabricate this output.
   */
  readonly pressed = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This Toggle's readonly effective Options observation. */
  readonly state = inject(OrigamiToggleState);

  readonly #context = inject(ToggleContext);

  /** @internal Effective pressed ARIA observation, always `true` or `false`. */
  protected readonly effectivePressed = this.#context.pressed;
  /** @internal Native disabled host binding. */
  protected readonly effectiveDisabled = this.#context.disabled;
  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = this.#context.disabledAria;
  /** @internal Readonly pressed host marker. */
  protected readonly pressedAttribute = this.#context.pressedAttribute;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;

  /** @internal Live native activation request, obeying effective disabled Options. */
  protected activate(): void {
    this.#context.toggle();
  }
}
