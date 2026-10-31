import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiDateFieldInput } from "@loozo/origami-ui/date-field";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import {
  OrigamiPopoverAnchor,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverTrigger,
  OrigamiPopoverTriggerOptions,
} from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { DatePickerContext } from "./date-picker-context";

/**
 * Substitutable Trigger identity and disabled policy; it supplies the composed Popover Trigger's
 * and Anchor's Options.
 */
export abstract class OrigamiDatePickerTriggerOptions {
  /** Effective reactive DOM ID. Generated identity is only the direct directive's default. */
  abstract readonly id: Signal<string>;
  /**
   * Natively disables this Trigger, as the picker's `disabled` does, so it doesn't open; direct
   * default false.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiDatePickerTriggerOptions>
      | AbstractType<OrigamiDatePickerTriggerOptions>,
  ): Provider {
    return { provide: OrigamiDatePickerTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Trigger Options configuration.
   * @param factory - Injection-context factory supplying `id` and `disabled`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiDatePickerTriggerOptions): Provider {
    return { provide: OrigamiDatePickerTriggerOptions, useFactory: factory };
  }
}

/**
 * The Trigger of an `ogDatePicker`: a native `type="button"` with `aria-haspopup="dialog"` that
 * opens and closes Content by click, Enter or Space. It composes the Popover Trigger and Anchor,
 * so Content is positioned against it, `aria-expanded` reports whether Content is shown and
 * `aria-controls` names mounted Content. Focus returns to it after a choice and Escape.
 *
 * It is disabled while the picker or its own Options are: its composed `ogButton` sets
 * `aria-disabled="true"`, `data-disabled` and native `disabled`, so it leaves the Tab order and
 * doesn't open. Requires a nearest picker root; a second mounted Trigger fails.
 *
 * Its shape follows where it sits, read once when it is created. In the button shape, outside
 * an `ogDateFieldInput`, it is the control of its nearest `ogField`, governed by the
 * `[formField]` on the picker root, and registers with the Field and the root once Angular has
 * set its inputs. Its `aria-labelledby` is the Field's Labels, then the Trigger itself, so the
 * name reads the label, then the Trigger's text (the date you render); outside a Field it is a
 * static `aria-labelledby` followed by the Trigger's ID, and absent without one, so the
 * Trigger's own text or `aria-label` names it. A Label has no `for`, so clicking it does
 * nothing. Its `aria-describedby` names the Field's Descriptions, then its mounted Errors, and
 * `aria-invalid="true"`, `aria-required="true"` and `aria-readonly="true"` follow the Field's
 * shown errors and the bound field.
 *
 * In the field shape, inside the picker's `ogDateFieldInput`, it is an action button beside the
 * segments: the Input group is the Field's control and supplies the field's name, and the
 * Trigger joins no Field. Name it with an `aria-label` ("Choose date"); a static
 * `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required` or `aria-readonly`
 * stays as you wrote it.
 *
 * It has no `state`: read the root's, through `#picker="ogDatePicker"`, or inject
 * `OrigamiDatePickerState`.
 */
@Directive({
  selector: "button[ogDatePickerTrigger]",
  exportAs: "ogDatePickerTrigger",
  hostDirectives: [OrigamiPopoverTrigger, OrigamiPopoverAnchor, ɵOrigamiDescribedBy],
  providers: [
    OrigamiDatePickerTriggerOptions.provideExisting(() => OrigamiDatePickerTrigger),
    OrigamiPopoverTriggerOptions.provideFactory(() => {
      const options = inject(OrigamiDatePickerTriggerOptions);

      return {
        id: options.id,
        disabled: options.disabled,
        focusableWhenDisabled: computed(() => false),
      };
    }),
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(OrigamiDatePickerTriggerOptions).id,
    })),
  ],
  host: {
    "aria-haspopup": "dialog",
    "[attr.aria-labelledby]": "ariaLabelledBy()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-required]": "ariaRequired()",
    "[attr.aria-readonly]": "ariaReadonly()",
  },
})
export class OrigamiDatePickerTrigger implements OrigamiDatePickerTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. */
  readonly id = input(injectUniqueId("date-picker-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiDatePickerTriggerOptions);
  readonly #context = inject(DatePickerContext);
  readonly #popoverTrigger = inject(OrigamiPopoverTrigger, { self: true });
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#options().id(), {
    labelable: false,
    formState: () => this.#context.formState(),
  });
  /** The field shape: inside an `ogDateFieldInput`, so not a Field member. */
  readonly #fieldShape = inject(OrigamiDateFieldInput, { optional: true }) !== null;
  /**
   * The template's static `aria-label`, which also names Content without its own name. The
   * template, not the element, like Content's static names.
   */
  readonly #staticLabel = inject(new HostAttributeToken("aria-label"), { optional: true });

  /**
   * @internal The Field's Labels inside a Field, otherwise the static value, then the Trigger
   * itself; absent without either. In the field shape, the static value alone.
   */
  protected readonly ariaLabelledBy = computed(() => {
    const labels = this.#membership.labelledBy();

    if (labels === null || this.#fieldShape) {
      return labels;
    }

    return `${labels} ${this.#options().id()}`;
  });
  /** @internal The Field's shown errors inside a Field; otherwise the static value. */
  protected readonly ariaInvalid = this.#membership.invalid;
  /** @internal The bound field's `required()` inside a Field; otherwise the static value. */
  protected readonly ariaRequired = this.#membership.required;
  /** @internal The bound field's `readonly()` inside a Field; otherwise the static value. */
  protected readonly ariaReadonly = this.#membership.readonly;

  /**
   * @internal Joins the nearest Field, in the button shape, and registers with the picker once
   * Angular has set its inputs.
   */
  ngOnInit(): void {
    if (!this.#fieldShape) {
      this.#membership.register(this.#destroyRef);
    }

    this.#context.registerTrigger(
      {
        element: this.#element,
        fieldShape: this.#fieldShape,
        id: () => this.#options().id(),
        labelledBy: this.#membership.labelledBy,
        label: this.#staticLabel,
        participating: this.#popoverTrigger.ɵparticipating,
      },
      this.#destroyRef,
    );
  }
}
