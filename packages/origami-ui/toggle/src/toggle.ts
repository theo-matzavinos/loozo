import {
  DestroyRef,
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred } from "@loozo/origami-ui/utils";

/** Effective Toggle configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToggleOptions {
  /** Writable pressed intent; the direct directive model defaults to false. External writes remain authoritative. */
  abstract readonly pressed: WritableSignal<boolean>;
  /** Blocks user activation, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Toggle is disabled, it stays focusable: `aria-disabled="true"` and `data-disabled`
   * without native `disabled`. Activation stays blocked, but the button's own `(click)` listeners
   * still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Replaces Toggle Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToggleOptions> | AbstractType<OrigamiToggleOptions>,
  ): Provider {
    return { provide: OrigamiToggleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Toggle Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `pressed`, `disabled` and
   *   `focusableWhenDisabled`.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleOptions): Provider {
    return { provide: OrigamiToggleOptions, useFactory: factory };
  }
}

@Service({ autoProvided: false })
class ToggleContext {
  readonly #options = injectDeferred(OrigamiToggleOptions);
  #destroyed = false;

  readonly pressed = computed(() => this.#options().pressed());
  readonly disabled = computed(() => this.#options().disabled());
  readonly focusableWhenDisabled = computed(() => this.#options().focusableWhenDisabled());

  readonly pressedAttribute = computed(() => {
    if (this.pressed()) {
      return "";
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
 * Disabled user actions cannot write pressed state. `aria-pressed` and `data-pressed` reflect
 * effective substituted Options; the composed `ogButton` binds `type="button"`, native
 * `disabled` (absent while `focusableWhenDisabled`), `aria-disabled` and `data-disabled` from them.
 * Consumers own the accessible name, label/icon changes, styling and any side effects.
 * Not a form control: it has no Signal Forms integration. A standalone Toggle has no group or
 * roving focus; `ogToggleGroupItem` from `@loozo/origami-ui/toggle-group` composes it into one,
 * and `ogToolbarToggle` from `@loozo/origami-ui/toolbar` is a Toggle that is one Toolbar control.
 * Don't apply another button primitive, such as `ogToolbarItem`, to the same button.
 * @example
 * ```html
 * <button ogToggle [(pressed)]="muted">Mute</button>
 * ```
 */
@Directive({
  selector: "button[ogToggle]",
  exportAs: "ogToggle",
  hostDirectives: [OrigamiButton],
  providers: [
    ToggleContext,
    OrigamiToggleState,
    OrigamiToggleOptions.provideExisting(() => OrigamiToggle),
    OrigamiButtonOptions.provideFactory(() => {
      const toggle = inject(ToggleContext);

      return { disabled: toggle.disabled, focusableWhenDisabled: toggle.focusableWhenDisabled };
    }),
  ],
  host: {
    "[attr.aria-pressed]": "effectivePressed()",
    "[attr.data-pressed]": "pressedAttribute()",
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
  /** Own input keeping the disabled Toggle focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** This Toggle's readonly effective Options observation. */
  readonly state = inject(OrigamiToggleState);

  readonly #context = inject(ToggleContext);

  /** @internal Effective pressed ARIA observation, always `true` or `false`. */
  protected readonly effectivePressed = this.#context.pressed;
  /** @internal Readonly pressed host marker. */
  protected readonly pressedAttribute = this.#context.pressedAttribute;

  /** @internal Live native activation request, obeying effective disabled Options. */
  protected activate(): void {
    this.#context.toggle();
  }
}
