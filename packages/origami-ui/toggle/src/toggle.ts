import {
  DestroyRef,
  Directive,
  InjectionToken,
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

/** Effective Toggle configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToggleOptions {
  /** Writable checked (pressed) intent; the direct directive model defaults to false. External writes remain authoritative. */
  abstract readonly checked: WritableSignal<boolean>;
  /** Blocks user activation, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Toggle is disabled, it stays focusable: `aria-disabled="true"` and `data-disabled`
   * without native `disabled`. Activation stays blocked, but the button's own `(click)` listeners
   * still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;
  /** Effective DOM ID; an `ogFieldLabel` of its Field names it with `for`. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces Toggle Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToggleOptions> | AbstractType<OrigamiToggleOptions>,
  ): Provider {
    return { provide: OrigamiToggleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Toggle Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `checked`, `disabled`,
   *   `focusableWhenDisabled` and `id`.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's
   *   output, and `[formField]` binds the model of the directive it finds, not the replacement.
   */
  static provideFactory(factory: () => OrigamiToggleOptions): Provider {
    return { provide: OrigamiToggleOptions, useFactory: factory };
  }
}

/**
 * @internal Package-private: provided on a Toggle's element by an Origami widget that composes
 * the Toggle as one of its parts, such as a ToggleGroup Item or a Toolbar Toggle. That Toggle is
 * not a form control: it never joins a Field and adds nothing to the element's description. Not
 * an application authoring API.
 */
export const ɵOrigamiToggleNotFormControl = new InjectionToken<true>(
  "ɵOrigamiToggleNotFormControl",
);

@Service({ autoProvided: false })
class ToggleContext {
  readonly #options = injectDeferred(OrigamiToggleOptions);
  readonly #formControl =
    inject(ɵOrigamiToggleNotFormControl, { self: true, optional: true }) === null;
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#options().id(), {
    labelable: true,
  });
  readonly #touches = new Subject<void>();
  #destroyed = false;

  readonly checked = computed(() => this.#options().checked());
  readonly disabled = computed(() => this.#options().disabled());
  readonly focusableWhenDisabled = computed(() => this.#options().focusableWhenDisabled());
  readonly id = computed(() => this.#options().id());
  /** Emits synchronously when the Toggle loses focus. */
  readonly touches = this.#touches.asObservable();

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

  /** Joins the nearest Field, unless a composing widget made this Toggle one of its parts. */
  register(destroyRef: DestroyRef): void {
    if (this.#formControl) {
      this.#membership.register(destroyRef);
    }
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

/** Locally provided readonly facade for its Toggle; each Toggle element has an independent owner. */
@Service({ autoProvided: false })
export class OrigamiToggleState {
  readonly #context = inject(ToggleContext);

  /** Effective checked (pressed) state. No writable mutation alias is exposed. */
  readonly checked: Signal<boolean> = this.#context.checked;
  /** Effective disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * A two-state button: native `type="button"` activation flips the effective checked state
 * exactly once. Enter/Space retain native button semantics; no custom keyboard handler is
 * supplied. User activation is dropped while disabled and while the `[formField]` on the same
 * element is readonly; external Options, model and form writes remain authoritative.
 * `aria-pressed`, always `"true"` or `"false"`, and `data-pressed` reflect the effective checked
 * state; the composed `ogButton` binds `type="button"`, native `disabled` (absent while
 * `focusableWhenDisabled`), `aria-disabled` and `data-disabled` from the effective Options. It
 * binds its effective `id`.
 *
 * It is an Angular Signal Forms checkbox control: `[formField]` binds its `checked` model, writes
 * its `disabled` input and listens to `touch`, which it emits on blur. It joins its nearest
 * `ogField` on its own, without `ogFieldControl`: the Field's Labels name it with `for`, which
 * also gives its accessible name and lets a label click toggle it. Inside a Field its
 * `aria-describedby` names the Field's Descriptions, then its mounted Errors, merged with the IDs
 * of a co-applied `ogTooltipTrigger` in the order they initialize, and a static value is kept
 * only while nothing names an ID. It binds no `aria-invalid`, `aria-required` or
 * `aria-readonly`, which ARIA doesn't support on a button; the Field's data attributes and State
 * carry them. It registers once Angular has set its inputs.
 *
 * Consumers own the accessible name, label/icon changes, styling and any side effects. A
 * standalone Toggle has no group or roving focus; `ogToggleGroupItem` from
 * `@loozo/origami-ui/toggle-group` composes it into one, and `ogToolbarToggle` from
 * `@loozo/origami-ui/toolbar` is a Toggle that is one Toolbar control; neither is a form control
 * or joins a Field. Don't apply another button primitive, such as `ogToolbarItem`, to the same
 * button.
 * @example
 * ```html
 * <button ogToggle [(checked)]="muted">Mute</button>
 * ```
 */
@Directive({
  selector: "button[ogToggle]",
  exportAs: "ogToggle",
  hostDirectives: [OrigamiButton, ɵOrigamiDescribedBy],
  providers: [
    ToggleContext,
    OrigamiToggleState,
    OrigamiToggleOptions.provideExisting(() => OrigamiToggle),
    OrigamiButtonOptions.provideFactory(() => {
      const toggle = inject(ToggleContext);

      return { disabled: toggle.disabled, focusableWhenDisabled: toggle.focusableWhenDisabled };
    }),
  ],
  host: {
    "[id]": "effectiveId()",
    "[attr.aria-pressed]": "effectiveChecked()",
    "[attr.data-pressed]": "checkedAttribute()",
    "(click)": "activate()",
    "(blur)": "blurred()",
  },
})
export class OrigamiToggle implements OrigamiToggleOptions, FormCheckboxControl {
  /**
   * Own checked (pressed) model, default false; `checkedChange` emits writes to this model, and
   * `[formField]` binds it. Replaced Options supply effective checked state instead and do not
   * fabricate this output.
   */
  readonly checked = model(false);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Toggle focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("toggle"));
  /** This Toggle's readonly effective Options observation. */
  readonly state = inject(OrigamiToggleState);

  readonly #context = inject(ToggleContext);
  readonly #destroyRef = inject(DestroyRef);

  /** Emits when the Toggle loses focus; `[formField]` marks its field touched. */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = this.#context.id;
  /** @internal Effective checked ARIA observation, always `true` or `false`. */
  protected readonly effectiveChecked = this.#context.checked;
  /** @internal Readonly checked host marker. */
  protected readonly checkedAttribute = this.#context.checkedAttribute;

  /** @internal Joins the nearest Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.register(this.#destroyRef);
  }

  /** @internal Live native activation request, obeying effective disabled Options and form readonly. */
  protected activate(): void {
    this.#context.toggle();
  }

  /** @internal Touch notification for Signal Forms. */
  protected blurred(): void {
    this.#context.blurred();
  }
}
