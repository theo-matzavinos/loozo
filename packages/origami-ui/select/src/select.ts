import {
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
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { ɵrequestSingleSelection } from "@loozo/origami-ui/collection";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { SelectContext, SelectRootOptions } from "./select-context";

/**
 * Effective root configuration, replaced as a whole rather than merged with unused defaults.
 * `T` is the value type, a string, number or boolean, compared with `===`.
 */
export abstract class OrigamiSelectOptions<
  T extends string | number | boolean = string | number | boolean,
> {
  /**
   * Writable selected value; the direct directive model defaults to null. Null or a value no
   * option has selects nothing and is never normalized: `"1"` and `1` are different values.
   * External writes remain authoritative; only a user's choice of an option writes it, and not
   * while the `[formField]` on the root is readonly.
   */
  abstract readonly value: WritableSignal<T | null>;
  /**
   * Requested open state of the list, writable by behavior; direct model default false. Opening
   * by the Trigger, choosing an option, Escape, Tab and an outside click write it.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Blocks opening and choosing, and natively disables the Trigger; default false. Disabling an
   * open Select closes it. External writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Select Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<T extends string | number | boolean>(
    type: () => Type<OrigamiSelectOptions<T>> | AbstractType<OrigamiSelectOptions<T>>,
  ): Provider {
    return { provide: OrigamiSelectOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Select Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, open and disabled.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory<T extends string | number | boolean>(
    factory: () => OrigamiSelectOptions<T>,
  ): Provider {
    return { provide: OrigamiSelectOptions, useFactory: factory };
  }
}

/**
 * A plain snapshot of the option that has the Select's value: its value, its explicit `label`
 * and its disabled state, from the option's effective Options.
 */
export type OrigamiSelectOptionRecord<
  T extends string | number | boolean = string | number | boolean,
> = {
  /** The Select's value, which this option has. */
  readonly value: T;
  /** The option's explicit `label` input, or null without one; never its text content. */
  readonly label: string | null;
  /** The option's own effective disabled state. */
  readonly disabled: boolean;
};

/** Locally provided readonly facade for the nearest Select root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiSelectState<T extends string | number | boolean = string | number | boolean> {
  readonly #options = injectDeferred<OrigamiSelectOptions<T>>(OrigamiSelectOptions);
  readonly #context = inject(SelectContext);

  /** Effective selected value, including null and values no option has. No writable alias is exposed. */
  readonly value: Signal<T | null> = computed(() => this.#options().value());
  /**
   * Whether the list is actually presented and interactive: the composed Popover's native
   * participation, not the requested `open`. False without Content, on the server and during
   * an exit.
   */
  readonly open: Signal<boolean> = this.#context.participating;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /**
   * The registered option that has the value, as a plain record, or null while the value is
   * null or no registered option has it: an unknown value, an option that isn't mounted yet, or
   * one in a block that hasn't hydrated. With several, the first registered one wins. Its
   * `label` is the option's explicit `label` input, so a Trigger can render it; an option
   * registers once Angular has set its inputs, and the reading view refreshes then, also in
   * server HTML.
   */
  readonly selectedOption: Signal<OrigamiSelectOptionRecord<T> | null> = computed(() => {
    const value = this.#options().value();

    if (value === null) {
      return null;
    }

    for (const option of this.#context.options()) {
      if (option.value() === value) {
        return { value, label: option.label(), disabled: option.disabled() };
      }
    }

    return null;
  });
}

/**
 * Select root: a single-choice list that opens from a Trigger button, the APG select-only
 * combobox. Focus stays on the Trigger while the active option moves with the keys, the pointer
 * and typeahead, named by the Trigger's `aria-activedescendant`. Only choosing an option, by
 * Enter, Space or a click, writes the value and closes the list; Escape, Tab and an outside click
 * close it without writing. The value is never written otherwise: null or a value no option has
 * selects nothing and is kept, and removing the selected option doesn't change it.
 *
 * `T` is the value type, a string, number or boolean, inferred from the `value` binding; values
 * compare with `===`, so an option `value="1"` never matches a number `1` (Angular doesn't check
 * an option's type against the root's). The root composes `ogPopover`, so the list is a Popover:
 * native top layer, Escape and outside dismissal, nesting in a Dialog or Popover. Consumers
 * render the Trigger's text from `state.value()` or `state.selectedOption()`, name the Trigger,
 * and own markup and styling.
 *
 * It is an Angular Signal Forms value control: `[formField]` on the root binds its `value` model,
 * writes its `disabled` input and listens to `touch`, which it emits when focus leaves the
 * Trigger, not when the list opens or closes or an option is chosen, since focus stays on the
 * Trigger; `focusBoundControl()` calls `focus()`, which focuses the Trigger. While the bound
 * field is readonly the list still opens and the active option moves, but choosing writes
 * nothing. The Trigger is the control of its nearest `ogField`: the Field's Labels name the
 * Trigger and the list through `aria-labelledby`, so a Label click does nothing; its
 * Descriptions, then its mounted Errors, describe the Trigger; and the Trigger's
 * `aria-invalid`, `aria-required` and `aria-readonly` follow the field. It has no `name` or
 * native form value.
 *
 * @example
 * ```html
 * <div ogSelect [(value)]="size" #select="ogSelect">
 *   <button ogSelectTrigger aria-label="Size">{{ select.state.value() ?? "Choose" }}</button>
 *   <div ogSelectContent>
 *     <div ogSelectOption value="s">Small</div>
 *     <div ogSelectOption value="m">Medium</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogSelect]",
  exportAs: "ogSelect",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiSelectOptions.provideExisting(() => OrigamiSelect),
    SelectRootOptions.provideFactory(() => {
      const options = inject(OrigamiSelectOptions);

      return {
        open: options.open,
        disabled: options.disabled,
        empty: computed(() => options.value() === null),
        selected: (value) => options.value() === value,
        choose: (value) => {
          ɵrequestSingleSelection(options.value, value, true, false);
          options.open.set(false);
        },
      };
    }),
    SelectContext,
    OrigamiSelectState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(SelectRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
  ],
})
export class OrigamiSelect<T extends string | number | boolean>
  implements OrigamiSelectOptions<T>, FormValueControl<T | null>
{
  /**
   * Own selected-value model, default null; `valueChange` emits user choices written to this
   * model, and `[formField]` binds it. Replaced Options supply the effective value instead and
   * do not fabricate this output.
   */
  readonly value = model<T | null>(null);
  /**
   * Own requested open-state model, default false; `openChange` emits the writes of opening,
   * choosing and dismissal. Replaced Options supply the effective state instead.
   */
  readonly open = model(false);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject<OrigamiSelectState<T>>(OrigamiSelectState);

  readonly #context = inject(SelectContext);

  /**
   * Emits when focus leaves the Trigger; `[formField]` marks its field touched. Opening,
   * browsing, choosing and Escape keep focus on the Trigger, so they don't emit.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the Trigger once it has registered, in its `ngOnInit`; does nothing before. Signal
   * Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the Trigger's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}
