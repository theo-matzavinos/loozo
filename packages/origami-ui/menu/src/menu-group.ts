import {
  DestroyRef,
  Directive,
  Service,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

/** @internal A group's registered label IDs, in registration order. */
@Service({ autoProvided: false })
export class MenuGroupContext {
  readonly #labels = signal<readonly Signal<string>[]>([]);

  /** The registered labels' IDs, space-separated; null while none is registered. */
  readonly labelledBy = computed(() => {
    const ids: string[] = [];

    for (const label of this.#labels()) {
      ids.push(label());
    }

    if (ids.length === 0) {
      return null;
    }

    return ids.join(" ");
  });

  /** Registers a label's ID from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  register(id: Signal<string>, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#labels.update((labels) => [...labels, id]);
    destroyRef.onDestroy(() => {
      this.#labels.update((labels) => {
        const remaining: Signal<string>[] = [];

        for (const label of labels) {
          if (label !== id) {
            remaining.push(label);
          }
        }

        return remaining;
      });
    });
  }
}

/**
 * A group of items in a Menu's Content: `role="group"`, named by its `ogMenuGroupLabel`s through
 * `aria-labelledby`, which is absent until a label registers. Items inside it stay in the menu's
 * arrow and typeahead order. It has no inputs.
 *
 * @example
 * ```html
 * <div ogMenuGroup>
 *   <span ogMenuGroupLabel>Sort by</span>
 *   <button ogMenuItem (select)="sort('name')">Name</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogMenuGroup]",
  providers: [MenuGroupContext],
  host: {
    role: "group",
    "[attr.aria-labelledby]": "labelledBy()",
  },
})
export class OrigamiMenuGroup {
  /** @internal The registered labels' IDs. */
  protected readonly labelledBy = inject(MenuGroupContext).labelledBy;
}

/** Substitutable group label identity. */
export abstract class OrigamiMenuGroupLabelOptions {
  /** Effective reactive DOM ID, which the group's `aria-labelledby` names. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces group label Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuGroupLabelOptions> | AbstractType<OrigamiMenuGroupLabelOptions>,
  ): Provider {
    return { provide: OrigamiMenuGroupLabelOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces group label Options.
   * @param factory - Injection-context factory supplying `id`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiMenuGroupLabelOptions): Provider {
    return { provide: OrigamiMenuGroupLabelOptions, useFactory: factory };
  }
}

/**
 * The visible label of its nearest `ogMenuGroup`: it renders its effective `id` and registers it
 * with the group once Angular has set its inputs, so the group's `aria-labelledby` names it. It
 * is never focused and never searched by typeahead. Requires a nearest Menu group.
 */
@Directive({
  selector: "[ogMenuGroupLabel]",
  providers: [OrigamiMenuGroupLabelOptions.provideExisting(() => OrigamiMenuGroupLabel)],
  host: {
    "[id]": "effectiveId()",
  },
})
export class OrigamiMenuGroupLabel implements OrigamiMenuGroupLabelOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("menu-group-label"));

  readonly #options = injectDeferred(OrigamiMenuGroupLabelOptions);
  readonly #group = inject(MenuGroupContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());

  /** @internal Registers its ID with the group once Angular has set its inputs. */
  ngOnInit(): void {
    this.#group.register(this.effectiveId, this.#destroyRef);
  }
}
