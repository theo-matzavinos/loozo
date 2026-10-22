import {
  DestroyRef,
  Directive,
  ElementRef,
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
  ɵOrigamiRovingFocusContext,
  ɵrequestMultipleSelection,
} from "@loozo/origami-ui/collection";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { injectDeferred, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import {
  OrigamiToggleGroupState,
  ownRovingFocus,
  ɵOrigamiToggleGroupRoot,
  ToggleGroupContext,
  ToggleGroupRootOptions,
} from "./toggle-group";
import type { OrigamiToggleGroupOrientation } from "./toggle-group";

/** Effective Multiple configuration; it has no Single `deselectable` policy. */
export abstract class OrigamiToggleGroupMultipleOptions {
  /**
   * Writable readonly-array pressed values; the direct directive model defaults to empty. Values
   * no item has persist in order; user activation writes new arrays. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<readonly string[]>;
  /**
   * Blocks every item's user activation, not external configuration writes; default false. It
   * removes the group's tab stop unless an item is `focusableWhenDisabled`; then the focused such
   * item, else the first, keeps it. In a Toolbar group, only such items stay tab-stop candidates.
   */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. Has no effect on a Toolbar Toggle Group, whose Toolbar's orientation applies. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;

  /**
   * Replaces Multiple Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
  ): Provider {
    return { provide: OrigamiToggleGroupMultipleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Multiple Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled and orientation.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupMultipleOptions): Provider {
    return { provide: OrigamiToggleGroupMultipleOptions, useFactory: factory };
  }

  /**
   * @internal Providers for a Multiple root directive that composes `ɵOrigamiToggleGroupRoot`:
   * its Options default and the root Options derived from these Options.
   * @param type - Deferred same-host directive supplying the default Options.
   * @param orientation - Supplies the effective axis in the root's injection context; omitted,
   *   these Options' orientation applies.
   * @returns Local providers for the Multiple root directive.
   */
  static ɵprovideRoot(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
    orientation?: () => Signal<OrigamiToggleGroupOrientation>,
  ): Provider[] {
    return [
      OrigamiToggleGroupMultipleOptions.provideExisting(type),
      ToggleGroupRootOptions.provideFactory(() => {
        const options = injectDeferred(OrigamiToggleGroupMultipleOptions);
        let effectiveOrientation: Signal<OrigamiToggleGroupOrientation> = computed(() =>
          options().orientation(),
        );

        if (orientation !== undefined) {
          effectiveOrientation = orientation();
        }

        return {
          disabled: computed(() => options().disabled()),
          orientation: effectiveOrientation,
          values: computed(() => options().value()),
          request: (value, pressed) => {
            ɵrequestMultipleSelection(options().value, value, pressed);
          },
        };
      }),
    ];
  }
}

/**
 * Multiple-pressed Toggle Group root: each item adds or removes its value. User activation
 * writes a new array that keeps every other value, including values no item has, in order, and
 * never mutates the caller's array; removing an item never prunes. Its items share one tab
 * stop, held by the focused item, else the first pressed in DOM order, else the first, and arrow
 * keys follow rendered DOM order; the model is never written without user action. Static
 * `role="group"` (a consumer's static `role` overrides it), `data-orientation` and
 * `data-disabled` reflect effective Options; there is no `aria-orientation`. Consumers own the
 * accessible name, item labels and styling. Inside an `ogToolbar` it keeps its own tab stop; to
 * share the Toolbar's, use `OrigamiToolbarToggleGroupMultiple` from `@loozo/origami-ui/toolbar`.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` input and listens to `touch`, which it emits when focus leaves the group, not while
 * focus moves between its items; `focusBoundControl()` calls `focus()`, which focuses the item
 * holding the tab stop. User activation is dropped while disabled and while the `[formField]` on
 * the root is readonly; focus still moves. It joins its nearest `ogField` on its own, without
 * `ogFieldControl`: inside a Field its `aria-labelledby` names the Field's Labels, replacing a
 * static value, and is absent while there is none, and its `aria-describedby` names the Field's
 * Descriptions, then its mounted Errors. It binds no `aria-invalid`, `aria-required` or
 * `aria-readonly`, which ARIA doesn't support on `group`; the Field's data attributes and State
 * carry them. It registers once Angular has set its inputs. Outside a Field, and as a second
 * control the Field ignores, it keeps a static `aria-labelledby` and `aria-describedby`.
 *
 * @example
 * ```html
 * <div ogToggleGroupMultiple [(value)]="marks" aria-label="Text formatting">
 *   <button ogToggleGroupItem value="bold">Bold</button>
 *   <button ogToggleGroupItem value="italic">Italic</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToggleGroupMultiple]",
  exportAs: "ogToggleGroupMultiple",
  hostDirectives: [ɵOrigamiToggleGroupRoot, ɵOrigamiDescribedBy],
  providers: [
    OrigamiToggleGroupMultipleOptions.ɵprovideRoot(() => OrigamiToggleGroupMultiple),
    ownRovingFocus,
  ],
  host: {
    "[attr.aria-labelledby]": "ariaLabelledBy()",
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiToggleGroupMultiple
  implements OrigamiToggleGroupMultipleOptions, FormValueControl<readonly string[]>
{
  /**
   * Own readonly-array model, default empty; `valueChange` emits user activations written to
   * this model, and `[formField]` binds it. Replaced Options supply the effective value instead
   * and do not fabricate this output.
   */
  readonly value = model<readonly string[]>([]);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);

  readonly #context = inject(ToggleGroupContext);
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

  /** @internal Joins the nearest Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
  }

  /**
   * Focuses the item holding the group's tab stop: the focused item, else the first pressed one in
   * DOM order, else the first enabled one. Does nothing while no item can take focus. Signal Forms'
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
