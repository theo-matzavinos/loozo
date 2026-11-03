import { DestroyRef, Directive, booleanAttribute, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ToastContext } from "./toast";

/** Substitutable Close disabled policy. */
export abstract class OrigamiToastCloseOptions {
  /** Blocks this button's activation, direct default false. The toast's timer still closes it. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the button is disabled it stays focusable: `aria-disabled="true"` and `data-disabled`
   * without native `disabled`. Activation stays blocked, but the button's own `(click)` listeners
   * still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Substitutes the entire Close configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToastCloseOptions> | AbstractType<OrigamiToastCloseOptions>,
  ): Provider {
    return { provide: OrigamiToastCloseOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Close configuration, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `disabled` and `focusableWhenDisabled`.
   * @returns A local provider, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiToastCloseOptions): Provider {
    return { provide: OrigamiToastCloseOptions, useFactory: factory };
  }
}

/**
 * A button that closes its toast: native button activation closes the nearest `ogToast`, which
 * runs its exit; if focus was in the toast, it moves first (see `OrigamiToastRegion`).
 * `type="button"` keeps it from submitting a form. While disabled, its composed `ogButton` sets
 * `aria-disabled="true"`, `data-disabled` and native `disabled` unless `focusableWhenDisabled`,
 * and activation is ignored. Give an icon-only Close an accessible name; it is read with the
 * toast's text. Don't apply another button primitive to the same button. Requires a nearest
 * `ogToast`.
 *
 * @example
 * ```html
 * <button ogToastClose aria-label="Close">×</button>
 * ```
 */
@Directive({
  selector: "button[ogToastClose]",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiToastCloseOptions.provideExisting(() => OrigamiToastClose),
    OrigamiButtonOptions.provideFactory(() => inject(OrigamiToastCloseOptions)),
  ],
  host: { "(click)": "activate()" },
})
export class OrigamiToastClose implements OrigamiToastCloseOptions {
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled button focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiToastCloseOptions);
  readonly #context = inject(ToastContext);
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      // Focus on this button, if it had it, went with it, without a `focusout`.
      this.#context.closeRemoved();
    });
  }

  /** @internal Live native activation; a disabled button closes nothing. */
  protected activate(): void {
    if (!this.#destroyed && !this.#options().disabled()) {
      this.#context.close();
    }
  }
}
