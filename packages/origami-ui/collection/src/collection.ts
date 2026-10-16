import {
  DestroyRef,
  Directive,
  ElementRef,
  Service,
  computed,
  inject,
  signal,
} from "@angular/core";
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

  /** Published members in DOM order, sorted on every call; reactive to membership only. */
  ordered(): readonly Member[] {
    const ordered = [...this.#members()];

    ordered.sort((left, right) => documentOrder(left.element, right.element));

    return ordered;
  }

  /**
   * The calling item host's unpublished member, captured in its injection context with its
   * caller-scoped `DestroyRef` cleanup, which removes only it. Publishing adds it to the members,
   * unless the host was already destroyed (a hook earlier in its view can destroy the view before
   * the item's `ngOnInit` runs).
   */
  member(options: () => OrigamiCollectionItemOptions): { publish(): void } {
    const member: Member = {
      element: inject<ElementRef<Element>>(ElementRef).nativeElement,
      record: { value: computed(() => options().value()) },
    };
    let destroyed = false;
    let published = false;

    inject(DestroyRef).onDestroy(() => {
      destroyed = true;

      if (!published) {
        return;
      }

      const remaining: Member[] = [];

      for (const mounted of this.#members()) {
        if (mounted !== member) {
          remaining.push(mounted);
        }
      }

      this.#members.set(remaining);
    });

    return {
      publish: () => {
        if (destroyed) {
          return;
        }

        published = true;
        this.#members.update((members) => [...members, member]);
      },
    };
  }
}

/** Locally provided readonly facade for the nearest Collection, including host-directive composition. */
@Service({ autoProvided: false })
export class OrigamiCollectionState {
  readonly #context = inject(CollectionContext);

  /**
   * Published records in DOM order as of the latest membership change. An item is published
   * once Angular has set its inputs. A keyed move that keeps membership doesn't notify readers;
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
