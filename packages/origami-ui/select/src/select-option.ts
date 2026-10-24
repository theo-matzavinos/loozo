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
import { SelectContext } from "./select-context";
import type { SelectOptionRegistration } from "./select-context";

/**
 * Effective option configuration. Other parts read it only once the option has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 * `T` is the value type, compared with the Select's value by `===`.
 */
export abstract class OrigamiSelectOptionOptions<
  T extends string | number | boolean = string | number | boolean,
> {
  /** The value choosing this option writes to its Select. Required: there is no generated default. */
  abstract readonly value: Signal<T>;
  /** Keeps the option from being chosen or made active by keys, typeahead or the pointer; default false. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Typeahead text and the `label` of the Select's `selectedOption()`; default null, where
   * typeahead reads the option's text when a key is pressed.
   */
  abstract readonly label: Signal<string | null>;
  /** Effective reactive DOM ID, which the Trigger's `aria-activedescendant` names while it is active. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces option Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<T extends string | number | boolean>(
    type: () => Type<OrigamiSelectOptionOptions<T>> | AbstractType<OrigamiSelectOptionOptions<T>>,
  ): Provider {
    return { provide: OrigamiSelectOptionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all option Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled, label and id.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory<T extends string | number | boolean>(
    factory: () => OrigamiSelectOptionOptions<T>,
  ): Provider {
    return { provide: OrigamiSelectOptionOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade of one option; descendants of the option inject it. */
@Service({ autoProvided: false })
export class OrigamiSelectOptionState {
  readonly #options = injectDeferred(OrigamiSelectOptionOptions);
  readonly #context = inject(SelectContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Whether the Select's value is this option's value. */
  readonly selected: Signal<boolean> = computed(() =>
    this.#context.selected(this.#options().value()),
  );
  /** Whether this is the active (highlighted) option; false while the list doesn't participate. */
  readonly active: Signal<boolean> = computed(
    () => this.#context.highlighted()?.element === this.#element,
  );
  /** The option's own effective disabled state. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
}

/**
 * One choice in a Select's Content: `role="option"` with an always-present `aria-selected`,
 * `aria-disabled="true"` while disabled, and empty `data-selected`, `data-active` and
 * `data-disabled` markers. Focus never moves to it: the Trigger names the active option with
 * `aria-activedescendant`. Moving the pointer over an enabled option makes it active; clicking
 * it chooses it, writes its value and closes the list. A disabled option ignores both and is
 * skipped by keys and typeahead.
 *
 * `value` is required: a generated value could never match a form value or survive a reload.
 * Values compare with `===`, so `value="1"` doesn't match a number `1`; bind `[value]="1"`.
 * `label` is the option's typeahead text and the label of `selectedOption()`; without it,
 * typeahead reads the option's text. Options register once Angular has set their inputs and may
 * come and go, also in `@for`, `@if` and `@defer`; an option that isn't mounted can't be
 * reached. Requires a nearest Select root.
 *
 * @example
 * ```html
 * <div ogSelectOption [value]="country.code" [label]="country.name">
 *   {{ country.flag }} {{ country.name }}
 * </div>
 * ```
 */
@Directive({
  selector: "[ogSelectOption]",
  exportAs: "ogSelectOption",
  providers: [
    OrigamiSelectOptionOptions.provideExisting(() => OrigamiSelectOption),
    OrigamiSelectOptionState,
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
export class OrigamiSelectOption<
  T extends string | number | boolean,
> implements OrigamiSelectOptionOptions<T> {
  /** Own value input, required; replaced Options supply the effective value. */
  readonly value = input.required<T>();
  /** Own disabled input, default false with boolean-attribute coercion. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own label input, default null: typeahead then reads the option's text. */
  readonly label = input<string | null>(null);
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. */
  readonly id = input(injectUniqueId("select-option"));
  /** This option's readonly State. */
  readonly state = inject(OrigamiSelectOptionState);

  readonly #options = injectDeferred(OrigamiSelectOptionOptions);
  readonly #context = inject(SelectContext);
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  readonly #registration: SelectOptionRegistration = {
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

  /** @internal A click chooses this option, unless it or the Select is disabled. */
  protected chosen(): void {
    if (!this.#destroyed) {
      this.#context.choose(this.#registration);
    }
  }

  /** @internal The pointer makes an enabled option active. */
  protected pointed(): void {
    if (!this.#destroyed && this.#context.active() !== this.#registration) {
      this.#context.point(this.#registration);
    }
  }
}
