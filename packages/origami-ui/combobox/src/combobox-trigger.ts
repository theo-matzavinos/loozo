import { Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiPopoverTrigger, OrigamiPopoverTriggerOptions } from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { ComboboxContext } from "./combobox-context";

/**
 * Substitutable Trigger identity; it supplies the composed Popover Trigger's Options, whose
 * disabled state is the Combobox's.
 */
export abstract class OrigamiComboboxTriggerOptions {
  /** Effective reactive DOM ID. Generated identity is only the direct directive's default. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces Trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiComboboxTriggerOptions> | AbstractType<OrigamiComboboxTriggerOptions>,
  ): Provider {
    return { provide: OrigamiComboboxTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the Trigger Options without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiComboboxTriggerOptions): Provider {
    return { provide: OrigamiComboboxTriggerOptions, useFactory: factory };
  }
}

/**
 * The optional button of an `ogCombobox`, such as a chevron: a click toggles the list and puts
 * focus in the input, and opening by it highlights nothing. It composes the Popover Trigger, so it
 * has `type="button"`, its own `id`, `aria-expanded` and `aria-controls`, and through it Button's
 * disabled attributes, natively disabled while the Combobox is. It has a static `tabindex="-1"`, so
 * Tab never stops on it, and a press on it keeps focus in the input. Name it yourself, such as
 * with `aria-label`. Requires a nearest Combobox root; a second mounted Trigger fails. It has no
 * `state`: read the root's.
 */
@Directive({
  selector: "button[ogComboboxTrigger]",
  exportAs: "ogComboboxTrigger",
  hostDirectives: [OrigamiPopoverTrigger],
  providers: [
    OrigamiComboboxTriggerOptions.provideExisting(() => OrigamiComboboxTrigger),
    OrigamiPopoverTriggerOptions.provideFactory(() => ({
      id: inject(OrigamiComboboxTriggerOptions).id,
      disabled: computed(() => false),
      focusableWhenDisabled: computed(() => false),
    })),
  ],
  host: {
    tabindex: "-1",
    "(mousedown)": "pressed($event)",
    "(click)": "clicked()",
  },
})
export class OrigamiComboboxTrigger implements OrigamiComboboxTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("combobox-trigger"));

  readonly #context = inject(ComboboxContext);

  /** @internal Keeps focus in the input: pressing the button doesn't move it. */
  protected pressed(event: MouseEvent): void {
    event.preventDefault();
  }

  /**
   * @internal Runs after the composed Popover Trigger toggled the list, in the same task: leaves a
   * session pending, so an open the consumer cancels at once still clears, and focuses the input,
   * which a press didn't leave in some engines and a click from elsewhere never reached.
   */
  protected clicked(): void {
    if (this.#context.disabled()) {
      return;
    }

    this.#context.toggled();
    this.#context.focus();
  }
}
