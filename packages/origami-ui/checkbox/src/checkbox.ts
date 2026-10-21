import {
  DestroyRef,
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
import type { FormCheckboxControl } from "@angular/forms/signals";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { injectDeferred, injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";

/** Effective Checkbox configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiCheckboxOptions {
  /** Writable checked intent; the direct directive model defaults to false. External writes remain authoritative. */
  abstract readonly checked: WritableSignal<boolean>;
  /** Blocks user activation, not external writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Checkbox is disabled, it stays focusable: `aria-disabled="true"` and
   * `data-disabled` without native `disabled`. Activation stays blocked, but the button's own
   * `(click)` listeners still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;
  /** Effective DOM ID; an `ogFieldLabel` of its Field names it with `for`. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces Checkbox Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiCheckboxOptions> | AbstractType<OrigamiCheckboxOptions>,
  ): Provider {
    return { provide: OrigamiCheckboxOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Checkbox Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `checked`, `disabled`,
   *   `focusableWhenDisabled` and `id`.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's
   *   output, and `[formField]` binds the model of the directive it finds, not the replacement.
   */
  static provideFactory(factory: () => OrigamiCheckboxOptions): Provider {
    return { provide: OrigamiCheckboxOptions, useFactory: factory };
  }
}

@Service({ autoProvided: false })
class CheckboxContext {
  readonly #options = injectDeferred(OrigamiCheckboxOptions);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#options().id(), {
    labelable: true,
  });
  readonly #touches = new Subject<void>();
  #destroyed = false;

  readonly checked = computed(() => this.#options().checked());
  readonly disabled = computed(() => this.#options().disabled());
  readonly focusableWhenDisabled = computed(() => this.#options().focusableWhenDisabled());
  readonly id = computed(() => this.#options().id());
  readonly invalid = this.#membership.invalid;
  readonly required = this.#membership.required;
  readonly readonly = this.#membership.readonly;
  /** Emits synchronously when the Checkbox loses focus. */
  readonly touches = this.#touches.asObservable();

  readonly checkedAria = computed(() => {
    if (this.checked()) {
      return "true";
    }

    return "false";
  });
  readonly checkedAttribute = computed(() => {
    if (this.checked()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  register(destroyRef: DestroyRef): void {
    this.#membership.register(destroyRef);
  }

  /** A user activation: dropped while disabled or while the bound field is readonly. */
  toggle(): void {
    const formReadonly = this.#membership.formState()?.readonly() ?? false;

    if (this.#destroyed || this.disabled() || formReadonly) {
      return;
    }

    this.#options().checked.set(!this.checked());
  }

  blurred(): void {
    this.#touches.next();
  }
}

/** Locally provided readonly facade for its Checkbox; each Checkbox element has an independent owner. */
@Service({ autoProvided: false })
export class OrigamiCheckboxState {
  readonly #context = inject(CheckboxContext);

  /** Effective checked state. No writable mutation alias is exposed. */
  readonly checked: Signal<boolean> = this.#context.checked;
  /** Effective disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * A two-state checkbox on a native button: `role="checkbox"` and always-present `aria-checked`,
 * `"true"` or `"false"`, with empty `data-checked` while checked. A click or Space, through
 * native button activation, flips the effective checked state exactly once; Enter does nothing,
 * as the ARIA checkbox pattern says. User activation is dropped while disabled and while the
 * `[formField]` on the same element is readonly; external Options and model writes remain
 * authoritative. The composed `ogButton` binds `type="button"`, native `disabled` (absent while
 * `focusableWhenDisabled`), `aria-disabled` and `data-disabled`. It binds its effective `id`.
 *
 * It is an Angular Signal Forms checkbox control: `[formField]` binds its `checked` model, writes
 * its `disabled` input and listens to `touch`, which it emits on blur. It joins its nearest
 * `ogField` on its own, without `ogFieldControl`: the Field's Labels name it with `for`, which
 * also gives its accessible name and lets a label click toggle it. Inside a Field its
 * `aria-describedby` names the Field's Descriptions, then its mounted Errors, merged with the IDs
 * of a co-applied `ogTooltipTrigger` in the order they initialize, and a static value is kept
 * only while nothing names an ID; it owns `aria-invalid` while the Field shows errors, and
 * `aria-required` and `aria-readonly` while the bound field is required or readonly. Outside a
 * Field it binds only its `id` and keeps those static ARIA attributes. It registers once Angular
 * has set its inputs. There is no mixed state, hidden `<input>` or form submission. Don't apply
 * another button primitive to the same button.
 * @example
 * ```html
 * <div ogField>
 *   <button ogCheckbox [formField]="form.terms"></button>
 *   <label ogFieldLabel>Accept the terms</label>
 * </div>
 * ```
 */
@Directive({
  selector: "button[ogCheckbox]",
  exportAs: "ogCheckbox",
  hostDirectives: [OrigamiButton, ɵOrigamiDescribedBy],
  providers: [
    CheckboxContext,
    OrigamiCheckboxState,
    OrigamiCheckboxOptions.provideExisting(() => OrigamiCheckbox),
    OrigamiButtonOptions.provideFactory(() => {
      const checkbox = inject(CheckboxContext);

      return {
        disabled: checkbox.disabled,
        focusableWhenDisabled: checkbox.focusableWhenDisabled,
      };
    }),
  ],
  host: {
    role: "checkbox",
    "[id]": "effectiveId()",
    "[attr.aria-checked]": "checkedAria()",
    "[attr.data-checked]": "checkedAttribute()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-required]": "ariaRequired()",
    "[attr.aria-readonly]": "ariaReadonly()",
    "(click)": "activate()",
    "(keydown)": "keydown($event)",
    "(blur)": "blurred()",
  },
})
export class OrigamiCheckbox implements OrigamiCheckboxOptions, FormCheckboxControl {
  /**
   * Own checked model, default false; `checkedChange` emits writes to this model, and
   * `[formField]` binds it. Replaced Options supply effective checked state instead and do not
   * fabricate this output.
   */
  readonly checked = model(false);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Checkbox focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("checkbox"));
  /** This Checkbox's readonly effective Options observation. */
  readonly state = inject(OrigamiCheckboxState);

  readonly #context = inject(CheckboxContext);
  readonly #destroyRef = inject(DestroyRef);

  /** Emits when the Checkbox loses focus; `[formField]` marks its field touched. */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = this.#context.id;
  /** @internal Effective checked ARIA observation, always `true` or `false`. */
  protected readonly checkedAria = this.#context.checkedAria;
  /** @internal Readonly checked host marker. */
  protected readonly checkedAttribute = this.#context.checkedAttribute;
  /** @internal Errors-shown state. */
  protected readonly ariaInvalid = this.#context.invalid;
  /** @internal The bound field's required state. */
  protected readonly ariaRequired = this.#context.required;
  /** @internal The bound field's readonly state. */
  protected readonly ariaReadonly = this.#context.readonly;

  /** @internal Joins the nearest Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.register(this.#destroyRef);
  }

  /** @internal Live native activation request, obeying effective disabled Options and form readonly. */
  protected activate(): void {
    this.#context.toggle();
  }

  /** @internal Enter doesn't check a checkbox (ARIA checkbox pattern); Space does, natively. */
  protected keydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  /** @internal Touch notification for Signal Forms. */
  protected blurred(): void {
    this.#context.blurred();
  }
}
