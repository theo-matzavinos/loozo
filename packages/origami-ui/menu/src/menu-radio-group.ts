import { Directive, Service, computed, forwardRef, inject, model } from "@angular/core";
import type { AbstractType, Provider, Type, WritableSignal } from "@angular/core";
import { ɵrequestSingleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { MenuGroupContext } from "./menu-group";

/** Effective radio group configuration, replaced as a whole. */
export abstract class OrigamiMenuRadioGroupOptions {
  /**
   * Writable selected value; the direct model defaults to null, where no item is checked. A
   * click, Enter or Space on an enabled radio item writes its value; selecting the checked item
   * writes nothing, so the group never clears. External writes remain authoritative, also values
   * no item has.
   */
  abstract readonly value: WritableSignal<string | null>;

  /**
   * Replaces radio group Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuRadioGroupOptions> | AbstractType<OrigamiMenuRadioGroupOptions>,
  ): Provider {
    return { provide: OrigamiMenuRadioGroupOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces radio group Options.
   * @param factory - Executes in Angular injection context; supply `value`.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's
   *   output.
   */
  static provideFactory(factory: () => OrigamiMenuRadioGroupOptions): Provider {
    return { provide: OrigamiMenuRadioGroupOptions, useFactory: factory };
  }
}

/** @internal A radio group's value and its write rule, which its radio items use. */
@Service({ autoProvided: false })
export class MenuRadioGroupContext {
  readonly #options = injectDeferred(OrigamiMenuRadioGroupOptions);

  /** The group's effective value. */
  readonly value = computed(() => this.#options().value());

  /** Selects `value`: a radio item's activation. The checked item writes nothing, so it never clears. */
  choose(value: string): void {
    ɵrequestSingleSelection(this.#options().value, value, true, false);
  }
}

/**
 * A group of radio items in a Menu's Content, of which one is checked, such as a list's density:
 * `role="group"`, named by its `ogMenuGroupLabel`s through `aria-labelledby` as `ogMenuGroup` is,
 * absent until a label registers. `value` is the checked `ogMenuRadioItem`'s value, or null. Its
 * items stay in the menu's arrow and typeahead order. It has no State.
 *
 * @example
 * ```html
 * <div ogMenuRadioGroup [(value)]="density">
 *   <span ogMenuGroupLabel>Density</span>
 *   <button ogMenuRadioItem value="compact">Compact</button>
 *   <button ogMenuRadioItem value="comfortable">Comfortable</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogMenuRadioGroup]",
  providers: [
    OrigamiMenuRadioGroupOptions.provideExisting(() => OrigamiMenuRadioGroup),
    MenuRadioGroupContext,
    MenuGroupContext,
  ],
  host: {
    role: "group",
    "[attr.aria-labelledby]": "labelledBy()",
  },
})
export class OrigamiMenuRadioGroup implements OrigamiMenuRadioGroupOptions {
  /**
   * Own selected-value model, default null; `valueChange` emits the items' selections. Replaced
   * Options supply the effective value instead.
   */
  readonly value = model<string | null>(null);

  /** @internal The registered labels' IDs. */
  protected readonly labelledBy = inject(MenuGroupContext).labelledBy;
}
