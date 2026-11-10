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
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  ɵOrigamiPopoverInputOwner,
} from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ComboboxContext, ComboboxRootOptions } from "./combobox-context";

/**
 * Effective root configuration, replaced as a whole rather than merged with unused defaults.
 * `T` is the value type, a string, number or boolean, compared with `===`.
 */
export abstract class OrigamiComboboxOptions<
  T extends string | number | boolean = string | number | boolean,
> {
  /**
   * Writable chosen value; the direct directive model defaults to null. Choosing an option writes
   * its value, and emptying the input writes null; typing anything else doesn't change it. Null or
   * a value no option has chooses nothing and is never normalized: `"1"` and `1` are different
   * values. External writes remain authoritative and don't change the input's text. Choosing
   * writes nothing while the `[formField]` on the root is readonly.
   */
  abstract readonly value: WritableSignal<T | null>;
  /**
   * Writable text of the input, the query the consumer filters options by; the direct directive
   * model defaults to `""`. Typing writes it, choosing writes the option's label, and closing
   * without a choice writes the committed text back: the last chosen label, `""` once the input
   * was emptied, or the last value written from outside. A write from outside also becomes that
   * committed text, so set the chosen option's label here when the value starts set.
   */
  abstract readonly query: WritableSignal<string>;
  /**
   * Requested open state of the list, writable by behavior; direct model default false. Typing,
   * the opening keys and the Trigger open it; choosing, Escape, Tab, focus moving from the input
   * to another element, an outside press and the Trigger close it.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Natively disables the input and the Trigger, and blocks opening and choosing; default false.
   * Disabling an open Combobox closes it. External writes remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Combobox Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<T extends string | number | boolean>(
    type: () => Type<OrigamiComboboxOptions<T>> | AbstractType<OrigamiComboboxOptions<T>>,
  ): Provider {
    return { provide: OrigamiComboboxOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Combobox Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, query, open and
   *   disabled.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's
   *   output.
   */
  static provideFactory<T extends string | number | boolean>(
    factory: () => OrigamiComboboxOptions<T>,
  ): Provider {
    return { provide: OrigamiComboboxOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest Combobox root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiComboboxState<T extends string | number | boolean = string | number | boolean> {
  readonly #options = injectDeferred<OrigamiComboboxOptions<T>>(OrigamiComboboxOptions);
  readonly #context = inject(ComboboxContext);

  /** Effective chosen value, including null and values no option has. No writable alias is exposed. */
  readonly value: Signal<T | null> = computed(() => this.#options().value());
  /** Effective text of the input. */
  readonly query: Signal<string> = computed(() => this.#options().query());
  /**
   * Whether the list is actually presented and interactive: the composed Popover's native
   * participation, not the requested `open`. False without Content, on the server and during
   * an exit.
   */
  readonly open: Signal<boolean> = this.#context.participating;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
}

/**
 * Combobox root: a text input with a popup list of options, the APG editable combobox with list
 * autocomplete. Typing writes `query` and opens the list; you filter the options by `query` and
 * render only the matches. Focus stays in the input while the arrows and the pointer move a
 * highlight through the options, named by the input's `aria-activedescendant`. Choosing an option,
 * by Enter or a click, writes its value, puts its label in the input and closes the list. Closing
 * without a choice, by Escape, Tab, an outside press or the Trigger, puts the last committed text
 * back. Only emptying the input clears the value.
 *
 * `T` is the value type, a string, number or boolean, inferred from the `value` binding; values
 * compare with `===`, as Select's. The root composes `ogPopover`, so the list is a Popover:
 * native top layer, Escape and outside dismissal, nesting in a Dialog or Popover; the input is its
 * Anchor and takes focus back when the list is dismissed. A value written from outside doesn't
 * change the text: write `query` with the chosen option's label yourself, such as on load or after
 * a form `reset()`.
 *
 * It is an Angular Signal Forms value control: `[formField]` on the root binds its `value` model,
 * writes its `disabled` input and listens to `touch`, which it emits when focus leaves the input,
 * not when the list opens or closes or an option is chosen, since focus stays in the input;
 * `focusBoundControl()` calls `focus()`, which focuses the input. While the bound field is
 * readonly the input is natively readonly, the arrows and the Trigger still open the list and move
 * the highlight, but choosing writes nothing. The input is the control of its nearest `ogField`:
 * the Field's `<label for>` names it.
 *
 * @example
 * ```html
 * <div ogCombobox [(value)]="country" [(query)]="query">
 *   <input ogComboboxInput aria-label="Country" />
 *   <div ogComboboxContent>
 *     @for (c of matches(); track c.code) {
 *       <div ogComboboxOption [value]="c.code" [label]="c.name">{{ c.name }}</div>
 *     }
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogCombobox]",
  exportAs: "ogCombobox",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiComboboxOptions.provideExisting(() => OrigamiCombobox),
    ComboboxRootOptions.provideFactory(() => inject(OrigamiComboboxOptions)),
    ComboboxContext,
    OrigamiComboboxState,
    OrigamiPopoverOptions.provideFactory(() => {
      const options = inject(OrigamiComboboxOptions);

      return { open: options.open, disabled: options.disabled, dismissible: computed(() => true) };
    }),
    {
      provide: ɵOrigamiPopoverInputOwner,
      useFactory: () => ({ input: inject(ComboboxContext).inputElement }),
    },
  ],
})
export class OrigamiCombobox<T extends string | number | boolean>
  implements OrigamiComboboxOptions<T>, FormValueControl<T | null>
{
  /**
   * Own chosen-value model, default null; `valueChange` emits the choices and the emptying written
   * to this model, and `[formField]` binds it. Replaced Options supply the effective value instead
   * and do not fabricate this output.
   */
  readonly value = model<T | null>(null);
  /**
   * Own input-text model, default `""`; `queryChange` emits typing, choosing and the committed text
   * a close writes back. Replaced Options supply the effective query instead.
   */
  readonly query = model("");
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
  readonly state = inject<OrigamiComboboxState<T>>(OrigamiComboboxState);

  readonly #context = inject(ComboboxContext);

  /**
   * Emits when focus leaves the input, also to another window; `[formField]` marks its field
   * touched. Opening, browsing, choosing and Escape keep focus in the input, so they don't emit.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the input once it has registered, in its `ngOnInit`; does nothing before. Signal
   * Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the input's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}
