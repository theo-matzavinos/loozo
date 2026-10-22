import { DestroyRef, Directive, booleanAttribute, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";

/** Substitutable Close disabled policy. */
export abstract class OrigamiDialogCloseOptions {
  /** Blocks this button's activation, direct default false. Escape and other dismissal are unaffected. */
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
    type: () => Type<OrigamiDialogCloseOptions> | AbstractType<OrigamiDialogCloseOptions>,
  ): Provider {
    return { provide: OrigamiDialogCloseOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Close configuration, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `disabled` and `focusableWhenDisabled`.
   * @returns A local provider, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiDialogCloseOptions): Provider {
    return { provide: OrigamiDialogCloseOptions, useFactory: factory };
  }
}

/**
 * A button that closes its Dialog: native button activation writes the root's `open` false,
 * whatever `dismissible` says, and the dialog runs its exit. `type="button"` keeps it from
 * submitting a form. While disabled, its composed `ogButton` sets `aria-disabled="true"`,
 * `data-disabled` and native `disabled` unless `focusableWhenDisabled`, and activation is
 * ignored. Give an icon-only Close an accessible name. Don't apply another button primitive to
 * the same button. Requires a nearest Dialog; any number of Close buttons may be mounted.
 *
 * @example
 * ```html
 * <button ogDialogClose autofocus [disabled]="pending()">Cancel</button>
 * ```
 */
@Directive({
  selector: "button[ogDialogClose]",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiDialogCloseOptions.provideExisting(() => OrigamiDialogClose),
    OrigamiButtonOptions.provideFactory(() => inject(OrigamiDialogCloseOptions)),
  ],
  host: { "(click)": "activate()" },
})
export class OrigamiDialogClose implements OrigamiDialogCloseOptions {
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled button focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiDialogCloseOptions);
  readonly #context = inject(DialogContext);
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Live native activation; a disabled button closes nothing. */
  protected activate(): void {
    if (!this.#destroyed && !this.#options().disabled()) {
      this.#context.setOpen(false);
    }
  }
}
