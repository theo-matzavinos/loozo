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
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { ComboboxContext } from "./combobox-context";
import type { ComboboxOptionRegistration } from "./combobox-context";

/**
 * Effective option configuration. Other parts read it only once the option has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 * `T` is the value type, compared with the Combobox's value by `===`.
 */
export abstract class OrigamiComboboxOptionOptions<
  T extends string | number | boolean = string | number | boolean,
> {
  /** The value choosing this option writes to its Combobox. Required: there is no generated default. */
  abstract readonly value: Signal<T>;
  /**
   * The text choosing this option puts in the input; default null, where choosing reads the
   * option's text with whitespace collapsed. Set it for options with more than their name in them.
   */
  abstract readonly label: Signal<string | null>;
  /** Keeps the option from being chosen or highlighted by keys or the pointer; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Effective reactive DOM ID, which the input's `aria-activedescendant` names while it is highlighted. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces option Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<T extends string | number | boolean>(
    type: () =>
      | Type<OrigamiComboboxOptionOptions<T>>
      | AbstractType<OrigamiComboboxOptionOptions<T>>,
  ): Provider {
    return { provide: OrigamiComboboxOptionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all option Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, label, disabled and id.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory<T extends string | number | boolean>(
    factory: () => OrigamiComboboxOptionOptions<T>,
  ): Provider {
    return { provide: OrigamiComboboxOptionOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade of one option; descendants of the option inject it. */
@Service({ autoProvided: false })
export class OrigamiComboboxOptionState {
  readonly #options = injectDeferred(OrigamiComboboxOptionOptions);
  readonly #context = inject(ComboboxContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Whether the Combobox's value is this option's value. */
  readonly selected: Signal<boolean> = computed(() =>
    this.#context.selected(this.#options().value()),
  );
  /** Whether this is the highlighted option; false while the list doesn't participate. */
  readonly active: Signal<boolean> = computed(
    () => this.#context.highlighted()?.element === this.#element,
  );
  /** The option's own effective disabled state. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
}

/**
 * One choice in a Combobox's Content: `role="option"` with an always-present `aria-selected`,
 * `aria-disabled="true"` while disabled, and empty `data-selected`, `data-active` and
 * `data-disabled` markers. Focus never moves to it: the input names the highlighted option with
 * `aria-activedescendant`. Moving the pointer over an enabled option highlights it; clicking it
 * chooses it: it writes its value, puts its label in the input and closes the list. A disabled
 * option ignores both and is skipped by the keys.
 *
 * `value` is required, and values compare with `===`, so `value="1"` doesn't match a number `1`;
 * bind `[value]="1"`. `label` is the text choosing it puts in the input; without it, the option's
 * text with whitespace collapsed, read when it's chosen. Options register once Angular has set
 * their inputs and may come and go with the query, in `@for`, `@if` and `@defer`; an option that
 * isn't mounted can't be reached, and a highlighted option that unmounts stops being highlighted.
 * Requires a nearest Combobox root.
 *
 * @example
 * ```html
 * <div ogComboboxOption [value]="customer.id" [label]="customer.name">
 *   <strong>{{ customer.name }}</strong> <small>{{ customer.email }}</small>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogComboboxOption]",
  exportAs: "ogComboboxOption",
  providers: [
    OrigamiComboboxOptionOptions.provideExisting(() => OrigamiComboboxOption),
    OrigamiComboboxOptionState,
  ],
  host: {
    role: "option",
    "[id]": "effectiveId()",
    "[attr.aria-selected]": "state.selected()",
    "[attr.aria-disabled]": "ariaDisabled()",
    "[attr.data-selected]": "selectedAttribute()",
    "[attr.data-active]": "activeAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "chosen()",
    "(pointermove)": "pointed()",
  },
})
export class OrigamiComboboxOption<
  T extends string | number | boolean,
> implements OrigamiComboboxOptionOptions<T> {
  /** Own value input, required; replaced Options supply the effective value. */
  readonly value = input.required<T>();
  /** Own label input, default null: choosing then reads the option's text. */
  readonly label = input<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. */
  readonly id = input(injectUniqueId("combobox-option"));
  /** This option's readonly State. */
  readonly state = inject(OrigamiComboboxOptionState);

  readonly #options = injectDeferred(OrigamiComboboxOptionOptions);
  readonly #context = inject(ComboboxContext);
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  readonly #registration: ComboboxOptionRegistration = {
    element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    id: computed(() => this.#options().id()),
    value: computed(() => this.#options().value()),
    disabled: computed(() => this.#options().disabled()),
    label: computed(() => this.#options().label()),
  };

  /** @internal Effective host identity. */
  protected readonly effectiveId = this.#registration.id;
  /** @internal `"true"` while disabled, otherwise absent. */
  protected readonly ariaDisabled = computed(() => {
    if (this.state.disabled()) {
      return "true";
    }

    return null;
  });
  /** @internal Selected host marker. */
  protected readonly selectedAttribute = computed(() => {
    if (this.state.selected()) {
      return "";
    }

    return null;
  });
  /** @internal Active host marker. */
  protected readonly activeAttribute = computed(() => {
    if (this.state.active()) {
      return "";
    }

    return null;
  });
  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.state.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this option once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerOption(this.#registration, this.#destroyRef);
  }

  /** @internal A click chooses this option, unless it or the Combobox is disabled. */
  protected chosen(): void {
    if (!this.#destroyed) {
      this.#context.choose(this.#registration);
    }
  }

  /** @internal The pointer highlights an enabled option. */
  protected pointed(): void {
    if (!this.#destroyed && this.#context.active() !== this.#registration) {
      this.#context.point(this.#registration);
    }
  }
}
