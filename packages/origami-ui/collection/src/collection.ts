import {
  DestroyRef,
  Directive,
  ElementRef,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";

/** Readonly observation of one mounted item; registration and DOM elements remain private. */
export interface OrigamiCollectionRecord {
  /** Effective reactive value; changing it does not replace the mounted record. */
  readonly value: Signal<string>;
}

type Registration = {
  readonly element: Element;
  readonly record: OrigamiCollectionRecord;
};

/** A sorted copy of one registrations array; never mutated after creation. */
type Snapshot = {
  readonly registrations: readonly Registration[];
  readonly order: readonly Registration[];
};

/**
 * True when every adjacent pair is connected and in forward DOM order, so the existing sorter
 * would return this same order. Disconnected or ambiguous pairs report false and fall back to it.
 */
function inDocumentOrder(order: readonly Registration[]): boolean {
  for (let index = 1; index < order.length; index += 1) {
    const position = order[index - 1].element.compareDocumentPosition(order[index].element);

    if ((position & 1) !== 0 || (position & 4) === 0) {
      return false;
    }
  }

  return true;
}

/** Module export for this entry point's package-private roving focus; never exported from the package. */
@Service({ autoProvided: false })
export class CollectionContext {
  readonly #registrations = signal<readonly Registration[]>([]);
  readonly #orderRevision = signal(0);
  #lastRenderedOrder: readonly Registration[] = [];
  #snapshot: Snapshot | null = null;
  /** Set by the first `items` evaluation and never reset; until then checkpoints only record membership. */
  #observed = false;
  /** Membership at the latest checkpoint skipped before the first read. */
  #skippedRegistrations: readonly Registration[] | null = null;
  /** Enclosing Collections that this Collection's items also joined; refreshed with it on the server. */
  readonly #joined = new Set<CollectionContext>();

  readonly items: Signal<readonly OrigamiCollectionRecord[]> = computed(() => {
    const records: OrigamiCollectionRecord[] = [];

    for (const registration of this.#current()) {
      records.push(registration.record);
    }

    return records;
  });

  /** Mounted item hosts in the same rendered DOM order as `items`; read only by roving focus. */
  readonly elements: Signal<readonly Element[]> = computed(() => {
    const elements: Element[] = [];

    for (const registration of this.#current()) {
      elements.push(registration.element);
    }

    return elements;
  });

  constructor() {
    afterEveryRender({ read: () => this.refreshOrder() });
  }

  refreshOrder(): void {
    // Unread order needs no validation: the first read computes current DOM order itself.
    if (!this.#observed) {
      this.#skippedRegistrations = this.#registrations();

      return;
    }

    const order = this.#ordered();
    let changed = order.length !== this.#lastRenderedOrder.length;

    for (let index = 0; !changed && index < order.length; index += 1) {
      changed = order[index] !== this.#lastRenderedOrder[index];
    }

    if (changed) {
      this.#lastRenderedOrder = order;
      this.#orderRevision.update((revision) => revision + 1);
    }
  }

  /**
   * Server view-check refresh of this order and of every Collection its items joined, whose own
   * hooks are skipped when only this Collection's descendant views are refreshed.
   */
  refreshServerOrder(): void {
    this.refreshOrder();

    for (const joined of this.#joined) {
      joined.refreshOrder();
    }
  }

  register(options: () => { readonly value: Signal<string> }): void {
    const element = inject<ElementRef<Element>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    const registration: Registration = {
      element,
      record: { value: computed(() => options().value()) },
    };

    this.#registrations.update((registrations) => [...registrations, registration]);
    destroyRef.onDestroy(() => {
      const remaining: Registration[] = [];

      for (const mounted of this.#registrations()) {
        if (mounted !== registration) {
          remaining.push(mounted);
        }
      }

      this.#registrations.set(remaining);
    });
  }

  /**
   * Registers the calling item host, whose nearest Collection is another one, as a member of this
   * enclosing Collection too; the nearest Collection's server view checks then refresh this order.
   */
  join(options: () => { readonly value: Signal<string> }): void {
    inject(CollectionContext).#joined.add(this);
    this.register(options);
  }

  /** Reactive current order: tracks order revisions and membership, observing on first read. */
  #current(): readonly Registration[] {
    this.#orderRevision();

    if (!this.#observed) {
      this.#observe();
    }

    return this.#ordered();
  }

  /**
   * Replays the latest skipped checkpoint, sorting its membership in current DOM, so the next
   * checkpoint publishes a revision only when order differs from that checkpoint's order.
   */
  #observe(): void {
    this.#observed = true;

    const skipped = this.#skippedRegistrations;

    if (skipped === null) {
      return;
    }

    this.#skippedRegistrations = null;
    this.#lastRenderedOrder = this.#sort(skipped);
  }

  /** Reuses the latest sorted snapshot while its membership and connected DOM order still hold. */
  #ordered(): readonly Registration[] {
    const registrations = this.#registrations();
    const snapshot = this.#snapshot;

    if (
      snapshot !== null &&
      snapshot.registrations === registrations &&
      inDocumentOrder(snapshot.order)
    ) {
      return snapshot.order;
    }

    return this.#sort(registrations);
  }

  #sort(registrations: readonly Registration[]): readonly Registration[] {
    const ordered = [...registrations];

    ordered.sort((left, right) => {
      const position = left.element.compareDocumentPosition(right.element);

      // Numeric DOM flags avoid requiring a browser-global Node on the server.
      if ((position & 1) !== 0) {
        return 0;
      }

      if ((position & 4) !== 0) {
        return -1;
      }

      if ((position & 2) !== 0) {
        return 1;
      }

      return 0;
    });

    this.#snapshot = { registrations, order: ordered };

    return ordered;
  }
}

/** Locally provided readonly facade for the nearest Collection, including host-directive composition. */
@Service({ autoProvided: false })
export class OrigamiCollectionState {
  readonly #context = inject(CollectionContext);

  /**
   * Mounted records in rendered DOM order, refreshed after keyed moves in browser and server renders.
   * SSR observes actual host nodes through server-only owner/item view-check hooks, including
   * descendant-only OnPush refreshes. No browser globals/callbacks are required, and unchanged
   * order checks do not publish revisions.
   * Nested Collections are independent; the array and each record's value are readonly observations.
   */
  readonly items: Signal<readonly OrigamiCollectionRecord[]> = this.#context.items;
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

  readonly #context = inject(CollectionContext);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));

  /** @internal Server-only post-view order check; browser order retains its after-render READ scheduling. */
  ngAfterViewChecked(): void {
    if (this.#server) {
      this.#context.refreshServerOrder();
    }
  }
}
