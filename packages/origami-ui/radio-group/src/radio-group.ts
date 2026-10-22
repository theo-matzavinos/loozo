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
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FormValueControl } from "@angular/forms/signals";
import {
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions,
  ɵrequestSingleSelection,
} from "@loozo/origami-ui/collection";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { injectDeferred, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiRadioGroupOptions {
  /**
   * Writable checked value; the direct directive model defaults to null. Null or a value no item
   * has checks nothing and is never normalized. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * Blocks every item's user selection, not external configuration writes; default false. It
   * removes the group's tab stop unless an item is `focusableWhenDisabled`; then the focused such
   * item, else the first, keeps it. In a Toolbar group, only such items stay tab-stop candidates.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Radio Group Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiRadioGroupOptions> | AbstractType<OrigamiRadioGroupOptions>,
  ): Provider {
    return { provide: OrigamiRadioGroupOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Radio Group Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and disabled.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiRadioGroupOptions): Provider {
    return { provide: OrigamiRadioGroupOptions, useFactory: factory };
  }
}

@Service({ autoProvided: false })
export class RadioGroupContext {
  readonly #options = injectDeferred(OrigamiRadioGroupOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  #destroyed = false;

  readonly value = computed(() => this.#options().value());
  readonly disabled = computed(() => this.#options().disabled());
  /** Emits synchronously when focus leaves the root's element; only `OrigamiRadioGroup` reports it. */
  readonly touches = this.#touches.asObservable();

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
    // Only a standalone group provides its own roving focus; there a keyboard move checks.
    inject(ɵOrigamiRovingFocusContext, { self: true, optional: true })?.navigations.subscribe(
      (value) => {
        this.select(value);
      },
    );
  }

  /**
   * A user check request; the caller has already applied its own disabled policy. Dropped while
   * disabled or while the `[formField]` on the root's element is readonly. There is no user
   * unchecking.
   */
  select(value: string): void {
    const formReadonly = this.#binding?.state().readonly() ?? false;

    if (!this.#destroyed && !this.disabled() && !formReadonly) {
      ɵrequestSingleSelection(this.#options().value, value, true, false);
    }
  }

  /** Focus left the root's element. */
  left(): void {
    this.#touches.next();
  }
}

/** Locally provided readonly facade for the nearest Radio Group root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiRadioGroupState {
  readonly #context = inject(RadioGroupContext);

  /** Effective checked value, including null and values no mounted item has. No writable alias is exposed. */
  readonly value: Signal<string | null> = this.#context.value;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * @internal Package-private shared Radio Group root, composed by `OrigamiRadioGroup` and
 * `OrigamiToolbarRadioGroup`, each of which supplies `OrigamiRadioGroupOptions`. It provides the
 * Context and State its items read. Static `role="radiogroup"` (a consumer's static `role`
 * overrides it); `data-disabled` reflects effective Options. Not an application API.
 */
@Directive({
  providers: [RadioGroupContext, OrigamiRadioGroupState],
  host: {
    role: "radiogroup",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class ɵOrigamiRadioGroupRoot {
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = inject(RadioGroupContext).disabledAttribute;
}

/**
 * Radio Group root: at most one item is checked, and the user can check an item but never
 * uncheck one. Its items share one tab stop, held by the focused item, else the checked one,
 * else the first, and all four arrow keys move along rendered DOM order. While the value is null
 * or no mounted item has it, nothing is checked; the model is never written without user action.
 * User selection is dropped while disabled and while the `[formField]` on the root is readonly;
 * focus still moves. Static `role="radiogroup"` (a consumer's static `role` overrides it);
 * `data-disabled` reflects effective Options. It has no orientation and binds no
 * `aria-orientation` or `aria-disabled`; consumers may write them statically, and own the
 * accessible name, item labels, layout and styling. Inside an `ogToolbar` it keeps its own tab
 * stop; to share the Toolbar's, use `OrigamiToolbarRadioGroup` from `@loozo/origami-ui/toolbar`.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` input and listens to `touch`, which it emits when focus leaves the group, not while
 * focus moves between its items; `focusBoundControl()` calls `focus()`, which focuses the item
 * holding the tab stop. It joins its nearest `ogField` on its own, without `ogFieldControl`:
 * inside a Field its `aria-labelledby` names the Field's Labels, replacing a static value, and is
 * absent while there is none; its `aria-describedby` names the Field's Descriptions, then its
 * mounted Errors; and `aria-invalid`, `aria-required` and `aria-readonly` follow the Field. It
 * registers once Angular has set its inputs. Outside a Field, and as a second control the Field
 * ignores, it keeps those attributes' static values. It has no `name` or native form value.
 *
 * @example
 * ```html
 * <div ogRadioGroup [(value)]="speed" aria-label="Shipping speed">
 *   <button ogRadioGroupItem value="standard">Standard</button>
 *   <button ogRadioGroupItem value="express">Express</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogRadioGroup]",
  exportAs: "ogRadioGroup",
  hostDirectives: [ɵOrigamiRadioGroupRoot, ɵOrigamiDescribedBy],
  providers: [
    OrigamiRadioGroupOptions.provideExisting(() => OrigamiRadioGroup),
    ɵOrigamiRovingFocusContext,
    ɵOrigamiRovingFocusOptions.provideFactory(() => {
      const context = inject(RadioGroupContext);

      return {
        orientation: computed<"both">(() => "both"),
        preferred: computed(() => {
          const value = context.value();

          if (value === null) {
            return [];
          }

          return [value];
        }),
      };
    }),
  ],
  host: {
    "[attr.aria-labelledby]": "ariaLabelledBy()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-required]": "ariaRequired()",
    "[attr.aria-readonly]": "ariaReadonly()",
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiRadioGroup
  implements OrigamiRadioGroupOptions, FormValueControl<string | null>
{
  /**
   * Own checked-value model, default null; `valueChange` emits user selections written to this
   * model, and `[formField]` binds it. Replaced Options supply the effective value instead and do
   * not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiRadioGroupState);

  readonly #context = inject(RadioGroupContext);
  readonly #focus = inject(ɵOrigamiRovingFocusContext, { self: true });
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#element.id, {
    labelable: false,
  });

  /**
   * Emits when focus leaves the group; `[formField]` marks its field touched. On engines where a
   * click doesn't focus a button (macOS Safari; macOS Firefox by default), clicking from one item
   * to another moves focus to nothing first, so it emits.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The Field's Label IDs inside a Field; otherwise the static value. */
  protected readonly ariaLabelledBy = this.#membership.labelledBy;
  /** @internal The Field's shown errors inside a Field; otherwise the static value. */
  protected readonly ariaInvalid = this.#membership.invalid;
  /** @internal The bound field's `required()` inside a Field; otherwise the static value. */
  protected readonly ariaRequired = this.#membership.required;
  /** @internal The bound field's `readonly()` inside a Field; otherwise the static value. */
  protected readonly ariaReadonly = this.#membership.readonly;

  /** @internal Joins the nearest Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
  }

  /**
   * Focuses the item holding the group's tab stop: the focused item, else the checked one, else
   * the first enabled one. Does nothing while no item can take focus. Signal Forms'
   * `focusBoundControl()` calls it.
   * @param options - Passed to the item's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#focus.tabStop()?.focus(options);
  }

  /** @internal Touch notification for Signal Forms, only when focus leaves the root's element. */
  protected focusLeft(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (next instanceof Node && this.#element.contains(next)) {
      return;
    }

    this.#context.left();
  }
}
