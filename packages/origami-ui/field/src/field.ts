import {
  DestroyRef,
  Directive,
  ErrorHandler,
  Service,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Signal, WritableSignal } from "@angular/core";
import type { FieldState, ValidationError } from "@angular/forms/signals";

/** @internal What a form control publishes to its Field when it registers. */
export type FieldControlRegistration = {
  /** The control's effective DOM ID. */
  readonly id: () => string;
  /** Whether a `<label for>` can name the control: true for native controls and buttons, false for groups. */
  readonly labelable: boolean;
  /** The Signal Forms state bound on the control's element, or null without `[formField]`. */
  readonly formState: () => FieldState<unknown> | null;
};

type PartRegistration = { readonly id: () => string };

const noErrors: readonly ValidationError[] = [];

function marker(value: boolean): "" | null {
  if (value) {
    return "";
  }

  return null;
}

/** @internal Nearest logical Field owner. Not an application authoring API. */
@Service({ autoProvided: false })
export class FieldContext {
  readonly #errorHandler = inject(ErrorHandler);
  readonly #control = signal<FieldControlRegistration | null>(null);
  readonly #descriptions = signal<readonly PartRegistration[]>([]);
  readonly #errors = signal<readonly PartRegistration[]>([]);
  readonly #formState = computed(() => this.#control()?.formState() ?? null);

  /** The registered control, or null. */
  readonly control: Signal<FieldControlRegistration | null> = this.#control.asReadonly();
  /** The registered control's ID while a `<label for>` can name it, otherwise null. */
  readonly labelFor = computed(() => {
    const control = this.#control();

    if (control === null || !control.labelable) {
      return null;
    }

    return control.id();
  });
  /** Registered Description IDs, then registered Error IDs, each in registration order; null when none. */
  readonly describedBy = computed(() => {
    const ids: string[] = [];

    for (const part of this.#descriptions()) {
      ids.push(part.id());
    }

    for (const part of this.#errors()) {
      ids.push(part.id());
    }

    if (ids.length === 0) {
      return null;
    }

    return ids.join(" ");
  });

  readonly invalid = computed(() => this.#formState()?.invalid() ?? false);
  readonly touched = computed(() => this.#formState()?.touched() ?? false);
  readonly disabled = computed(() => this.#formState()?.disabled() ?? false);
  readonly required = computed(() => this.#formState()?.required() ?? false);
  readonly errors = computed<readonly ValidationError[]>(
    () => this.#formState()?.errors() ?? noErrors,
  );
  readonly errorsShown = computed(() => this.invalid() && this.touched());

  readonly invalidAttribute = computed(() => marker(this.errorsShown()));
  readonly disabledAttribute = computed(() => marker(this.disabled()));
  readonly requiredAttribute = computed(() => marker(this.required()));

  /**
   * Registers the control from its `ngOnInit`, unless its view is already destroyed;
   * `destroyRef` removes it. A second control is reported through `ErrorHandler` and ignored.
   */
  registerControl(control: FieldControlRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (this.#control() !== null) {
      this.#errorHandler.handleError(new Error("Field supports only one control."));

      return;
    }

    this.#control.set(control);
    destroyRef.onDestroy(() => {
      if (this.#control() === control) {
        this.#control.set(null);
      }
    });
  }

  /** Registers a Description from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerDescription(part: PartRegistration, destroyRef: DestroyRef): void {
    this.#register(this.#descriptions, part, destroyRef);
  }

  /** Registers an Error from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerError(part: PartRegistration, destroyRef: DestroyRef): void {
    this.#register(this.#errors, part, destroyRef);
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register(
    slot: WritableSignal<readonly PartRegistration[]>,
    part: PartRegistration,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    slot.update((parts) => [...parts, part]);
    destroyRef.onDestroy(() => {
      const remaining: PartRegistration[] = [];

      for (const mounted of slot()) {
        if (mounted !== part) {
          remaining.push(mounted);
        }
      }

      slot.set(remaining);
    });
  }
}

/**
 * Locally provided readonly facade over the nearest Field: the Signal Forms state of its
 * registered control. Every signal is false, and `errors` empty, while no control is registered or
 * the control has no `[formField]`. Nested Fields have independent owners.
 */
@Service({ autoProvided: false })
export class OrigamiFieldState {
  readonly #context = inject(FieldContext);

  /** Whether the bound field has validation errors (Signal Forms `invalid()`), shown or not. */
  readonly invalid: Signal<boolean> = this.#context.invalid;
  /** Whether the bound field is touched: blurred, or marked by `submit()` or `markAsTouched()`. */
  readonly touched: Signal<boolean> = this.#context.touched;
  /** Whether the bound field is disabled, by its own `disabled()` rule or an ancestor's. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** Whether the bound field is required (`required()` validator). */
  readonly required: Signal<boolean> = this.#context.required;
  /**
   * The bound field's own validation errors (Signal Forms `FieldState.errors()`, without its
   * descendants'), as the base `ValidationError` type; empty without a bound field.
   */
  readonly errors: Signal<readonly ValidationError[]> = this.#context.errors;
  /**
   * Whether the errors should be shown: `invalid()` and `touched()`. A blur or `submit()` shows
   * them. The Field's `data-invalid` and the control's `aria-invalid` follow it.
   */
  readonly errorsShown: Signal<boolean> = this.#context.errorsShown;
}

/**
 * Groups one form control with its labels, descriptions and errors and wires them together:
 * `ogFieldLabel`'s `for` names the control, and the control's `aria-describedby` names every
 * `ogFieldDescription`, then every mounted `ogFieldError`. It exposes the Signal Forms state of
 * its control's `[formField]` as `state`, with `errorsShown` for gating error messages.
 *
 * The root has no inputs, no Options and no role; for a set of Fields use your own
 * `<fieldset>` and `<legend>`. It binds empty `data-invalid` while errors are shown,
 * `data-disabled` while the field is disabled and `data-required` while it is required.
 * Parts and controls join the nearest Field; one control per Field, and a second control is
 * reported through Angular's `ErrorHandler` and ignored.
 *
 * @example
 * ```html
 * <div ogField #email="ogField">
 *   <label ogFieldLabel>Email</label>
 *   <input ogFieldControl type="email" [formField]="form.email" />
 *   <p ogFieldDescription>We never share it.</p>
 *   @if (email.state.errorsShown()) {
 *     <p ogFieldError>{{ email.state.errors()[0]?.message }}</p>
 *   }
 * </div>
 * ```
 */
@Directive({
  selector: "[ogField]",
  exportAs: "ogField",
  providers: [FieldContext, OrigamiFieldState],
  host: {
    "[attr.data-invalid]": "invalidAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "[attr.data-required]": "requiredAttribute()",
  },
})
export class OrigamiField {
  /** This Field's readonly form state, also injectable by its descendants. */
  readonly state = inject(OrigamiFieldState);

  readonly #context = inject(FieldContext);

  /** @internal Errors-shown marker. */
  protected readonly invalidAttribute = this.#context.invalidAttribute;
  /** @internal Disabled marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
  /** @internal Required marker. */
  protected readonly requiredAttribute = this.#context.requiredAttribute;
}
