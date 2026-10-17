import { DestroyRef, Directive, Service, computed, inject, signal } from "@angular/core";
import type { Signal } from "@angular/core";
import type { OrigamiCollectionItemOptions } from "./collection-item";
import { documentOrder } from "./document-order";

/** Readonly observation of one mounted item; registration and DOM elements remain private. */
export interface OrigamiCollectionRecord {
  /** Effective reactive value; changing it does not replace the mounted record. */
  readonly value: Signal<string>;
}

type Member = {
  readonly element: Element;
  readonly record: OrigamiCollectionRecord;
};

/** Module export for this entry point's items; never exported from the package. */
@Service({ autoProvided: false })
export class CollectionContext {
  readonly #members = signal<readonly Member[]>([]);

  /** Registered members in DOM order, sorted on every call; reactive to membership only. */
  ordered(): readonly Member[] {
    const ordered = [...this.#members()];

    ordered.sort((left, right) => documentOrder(left.element, right.element));

    return ordered;
  }

  /**
   * Registers an item host from its `ngOnInit`, unless its view is already destroyed (a hook
   * earlier in its view can destroy the view before the item's `ngOnInit` runs); `destroyRef`
   * removes only it.
   */
  register(
    item: { readonly element: Element; readonly options: () => OrigamiCollectionItemOptions },
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    const member: Member = {
      element: item.element,
      record: { value: computed(() => item.options().value()) },
    };

    this.#members.update((members) => [...members, member]);
    destroyRef.onDestroy(() => {
      const remaining: Member[] = [];

      for (const mounted of this.#members()) {
        if (mounted !== member) {
          remaining.push(mounted);
        }
      }

      this.#members.set(remaining);
    });
  }
}

/** Locally provided readonly facade for the nearest Collection, including host-directive composition. */
@Service({ autoProvided: false })
export class OrigamiCollectionState {
  readonly #context = inject(CollectionContext);

  /**
   * Registered records in DOM order as of the latest membership change. An item registers once
   * Angular has set its inputs. A keyed move that keeps membership doesn't notify readers;
   * the next insertion or removal reads the current DOM order again. Nested Collections are
   * independent; the array and each record's value are readonly observations.
   */
  readonly items: Signal<readonly OrigamiCollectionRecord[]> = computed(() => {
    const records: OrigamiCollectionRecord[] = [];

    for (const member of this.#context.ordered()) {
      records.push(member.record);
    }

    return records;
  });
}

/**
 * Owns a nearest-DI collection of mounted items. Supplies no role, selection, keyboard
 * navigation or roving tabindex. Consumers own markup and distinct domain values when needed.
 *
 * @example
 * ```html
 * <section ogCollection #collection="ogCollection">
 *   <span ogCollectionItem value="billing">Billing</span>
 * </section>
 * ```
 */
@Directive({
  selector: "[ogCollection]",
  exportAs: "ogCollection",
  providers: [CollectionContext, OrigamiCollectionState],
})
export class OrigamiCollection {
  /** This owner's shared readonly collection observation; nested owners provide separate instances. */
  readonly state = inject(OrigamiCollectionState);
}
