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
import { ɵrequestMultipleSelection } from "@loozo/origami-ui/collection";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { OrigamiSelectOptionRecord } from "./select";
import { SelectContext, SelectRootOptions } from "./select-context";
import type { SelectValue } from "./select-context";

/**
 * Effective multiple-selection root configuration, replaced as a whole rather than merged with
 * unused defaults. `T` is the value type, a string, number or boolean, compared with `===`.
 */
export abstract class OrigamiSelectMultipleOptions<
  T extends string | number | boolean = string | number | boolean,
> {
  /**
   * Writable selected values in their own order; the direct directive model defaults to empty.
   * Values no option has are kept in order and never normalized: `"1"` and `1` are different
   * values. External writes remain authoritative; only a user's toggle of an option writes it, a
   * new array each time, and not while the `[formField]` on the root is readonly.
   */
  abstract readonly value: WritableSignal<readonly T[]>;
  /**
   * Requested open state of the list, writable by behavior; direct model default false. Opening
   * by the Trigger, Escape, Tab, an outside click and a Trigger click write it; toggling an option
   * doesn't.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Blocks opening and toggling, and natively disables the Trigger; default false. Disabling an
   * open Select closes it. External writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces multiple Select Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<T extends string | number | boolean>(
    type: () =>
      | Type<OrigamiSelectMultipleOptions<T>>
      | AbstractType<OrigamiSelectMultipleOptions<T>>,
  ): Provider {
    return { provide: OrigamiSelectMultipleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all multiple Select Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, open and disabled.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory<T extends string | number | boolean>(
    factory: () => OrigamiSelectMultipleOptions<T>,
  ): Provider {
    return { provide: OrigamiSelectMultipleOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest multiple Select root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiSelectMultipleState<
  T extends string | number | boolean = string | number | boolean,
> {
  readonly #options = injectDeferred<OrigamiSelectMultipleOptions<T>>(OrigamiSelectMultipleOptions);
  readonly #context = inject(SelectContext);

  /**
   * Effective selected values in their own order, including values no option has. No writable
   * alias is exposed; its `length` is the number of selected values.
   */
  readonly value: Signal<readonly T[]> = computed(() => this.#options().value());
  /**
   * Whether the list is actually presented and interactive: the composed Popover's native
   * participation, not the requested `open`. False without Content, on the server and during
   * an exit.
   */
  readonly open: Signal<boolean> = this.#context.participating;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /**
   * The registered options that have a selected value, as plain records in the value's order: for
   * each value, the first registered option that has it. Values no registered option has are left
   * out: unknown values, options that aren't mounted yet and options in a block that hasn't
   * hydrated. An option registers once Angular has set its inputs, and the reading view refreshes
   * then, also in server HTML.
   */
  readonly selectedOptions: Signal<readonly OrigamiSelectOptionRecord<T>[]> = computed(() => {
    const options = this.#context.options();
    const records: OrigamiSelectOptionRecord<T>[] = [];

    for (const value of this.#options().value()) {
      for (const option of options) {
        if (option.value() === value) {
          records.push({ value, label: option.label(), disabled: option.disabled() });

          break;
        }
      }
    }

    return records;
  });
}

/**
 * Multiple-selection Select root: a list of toggles that opens from a Trigger button, sharing
 * `ogSelectTrigger`, `ogSelectContent` and `ogSelectOption` with `ogSelect`. Focus stays on the
 * Trigger while the active option moves with the keys, the pointer and typeahead, named by the
 * Trigger's `aria-activedescendant`; Content is `aria-multiselectable="true"`. Enter, Space and a
 * click toggle the active or clicked option and keep the list open; Escape, Tab, an outside click
 * and a Trigger click close it. Opening highlights the first selected option in DOM order, else
 * the first enabled one. A toggle appends a value at the end of a new array or removes it into a
 * new array, keeping every other value, including values no option has, in order. The value is
 * never written otherwise: removing an option doesn't prune it.
 *
 * `T` is the value type, a string, number or boolean, inferred from the `value` binding; values
 * compare with `===`, so an option `value="1"` never matches a number `1`. The root composes
 * `ogPopover`, so the list is a Popover: native top layer, Escape and outside dismissal, nesting
 * in a Dialog or Popover. Consumers render the Trigger's text from `state.value()` or
 * `state.selectedOptions()`, name the Trigger, and own markup and styling.
 *
 * It is an Angular Signal Forms value control for an array field: `[formField]` on the root binds
 * its `value` model, writes its `disabled` input and listens to `touch`, which it emits when focus
 * leaves the Trigger, not when the list opens or closes or an option is toggled;
 * `focusBoundControl()` calls `focus()`, which focuses the Trigger. While the bound field is
 * readonly the list still opens and the active option moves, but toggling writes nothing. The
 * Trigger is the control of its nearest `ogField`, as under `ogSelect`.
 *
 * @example
 * ```html
 * <div ogSelectMultiple [(value)]="toppings" #pick="ogSelectMultiple">
 *   <button ogSelectTrigger aria-label="Toppings">{{ pick.state.value().length }} selected</button>
 *   <div ogSelectContent>
 *     <div ogSelectOption value="olives">Olives</div>
 *     <div ogSelectOption value="basil">Basil</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogSelectMultiple]",
  exportAs: "ogSelectMultiple",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiSelectMultipleOptions.provideExisting(() => OrigamiSelectMultiple),
    SelectRootOptions.provideFactory(() => {
      const options = inject(OrigamiSelectMultipleOptions);
      // `===`, as in `selectedOptions` and the write rule's removal, not `includes`, whose
      // SameValueZero would select a NaN option that no toggle could then remove.
      const selected = (value: SelectValue) => options.value().some((entry) => entry === value);

      return {
        multiple: true,
        open: options.open,
        disabled: options.disabled,
        empty: computed(() => options.value().length === 0),
        selected,
        choose: (value) => {
          ɵrequestMultipleSelection(options.value, value, !selected(value));
        },
      };
    }),
    SelectContext,
    OrigamiSelectMultipleState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(SelectRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
  ],
})
export class OrigamiSelectMultiple<T extends string | number | boolean>
  implements OrigamiSelectMultipleOptions<T>, FormValueControl<readonly T[]>
{
  /**
   * Own selected-values model, default empty; `valueChange` emits user toggles written to this
   * model, and `[formField]` binds it. Replaced Options supply the effective value instead and do
   * not fabricate this output.
   */
  readonly value = model<readonly T[]>([]);
  /**
   * Own requested open-state model, default false; `openChange` emits the writes of opening and
   * dismissal. Replaced Options supply the effective state instead.
   */
  readonly open = model(false);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject<OrigamiSelectMultipleState<T>>(OrigamiSelectMultipleState);

  readonly #context = inject(SelectContext);

  /**
   * Emits when focus leaves the Trigger; `[formField]` marks its field touched. Opening,
   * browsing, toggling and Escape keep focus on the Trigger, so they don't emit.
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
