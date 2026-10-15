import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

// Module-private so Options retain structural compatibility in packaged declarations.
const itemReplacement = new InjectionToken<OrigamiCollectionItemOptions>(
  "Collection Item replacement",
);

/** Readonly observation of one mounted item; registration and DOM elements remain private. */
export interface OrigamiCollectionRecord {
  /** Effective reactive value; changing it does not replace the mounted record. */
  readonly value: Signal<string>;
}

/**
 * Effective item configuration, substitutable as a whole for direct or host-composed items.
 * Helpers return local replacement-and-alias arrays, safe to nest in `providers`.
 * Primitive defaults cannot override replacements when direct/host selectors co-match.
 */
export abstract class OrigamiCollectionItemOptions {
  /** Item value, defaulting to an opaque mounted-stable generated identity. No normalization is performed. */
  abstract readonly value: Signal<string>;

  /**
   * Uses an existing compatible concrete or abstract provider for the item's configuration.
   * @param type - Forward-reference supplier, resolved only after construction.
   * @returns A local replacement-and-alias provider array suitable for consumer host-directive composition.
   */
  static provideExisting(
    type: () => Type<OrigamiCollectionItemOptions> | AbstractType<OrigamiCollectionItemOptions>,
  ): Provider[] {
    return [
      { provide: itemReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiCollectionItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * Replaces effective item configuration without merging unused directive defaults.
   * @param factory - Injection-context factory supplying the required value signal.
   * @returns A local replacement-and-alias provider array.
   */
  static provideFactory(factory: () => OrigamiCollectionItemOptions): Provider[] {
    return [
      { provide: itemReplacement, useFactory: factory },
      { provide: OrigamiCollectionItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only primitive default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction only when no local replacement exists.
   * @returns A local array holding one Options factory; ancestor replacement tokens are deliberately ignored.
   */
  static ɵprovideDefault(type: () => Type<OrigamiCollectionItemOptions>): Provider[] {
    return [
      {
        provide: OrigamiCollectionItemOptions,
        useFactory: () => {
          const replacement = inject(itemReplacement, {
            self: true,
            optional: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject<OrigamiCollectionItemOptions>(forwardRef(type));
        },
      },
    ];
  }
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

@Service({ autoProvided: false })
class CollectionContext {
  readonly #registrations = signal<readonly Registration[]>([]);
  readonly #orderRevision = signal(0);
  #lastRenderedOrder: readonly Registration[] = [];
  #snapshot: Snapshot | null = null;
  /** Set by the first `items` evaluation and never reset; until then checkpoints only record membership. */
  #observed = false;
  /** Membership at the latest checkpoint skipped before the first read. */
  #skippedRegistrations: readonly Registration[] | null = null;

  readonly items: Signal<readonly OrigamiCollectionRecord[]> = computed(() => {
    this.#orderRevision();

    if (!this.#observed) {
      this.#observe();
    }

    const records: OrigamiCollectionRecord[] = [];

    for (const registration of this.#ordered()) {
      records.push(registration.record);
    }

    return records;
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

  register(): void {
    const element = inject<ElementRef<Element>>(ElementRef).nativeElement;
    const options = injectDeferred(OrigamiCollectionItemOptions);
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
      this.#context.refreshOrder();
    }
  }
}

/**
 * Registers one host with its nearest logical Collection owner during construction.
 * Options are resolved later, avoiding consumer/host-directive construction cycles.
 * Helper-provided replacements override the default even when direct and host-composed selectors co-match.
 * Server item-view checks refresh order even when an unchanged OnPush owner is only traversed.
 * Caller-scoped destruction removes only this registration. An orphan fails Angular DI clearly.
 */
@Directive({
  selector: "[ogCollectionItem]",
  exportAs: "ogCollectionItem",
  providers: [OrigamiCollectionItemOptions.ɵprovideDefault(() => OrigamiCollectionItem)],
})
export class OrigamiCollectionItem implements OrigamiCollectionItemOptions {
  /**
   * Own value input, default opaque generated identity. Reused SSR element hosts preserve
   * the default through hydration; persistent domain identity should use explicit values.
   * Replaced Options supply effective values instead of this unused default.
   */
  readonly value = input(injectUniqueId("collection-item"));

  readonly #context = inject(CollectionContext);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));

  /** Registers synchronously in this item's injection context, with this item's DestroyRef cleanup. */
  constructor() {
    this.#context.register();
  }

  /** @internal Checks server order in this item's view when descendant-only refreshes skip owner hooks. */
  ngAfterViewChecked(): void {
    if (this.#server) {
      this.#context.refreshOrder();
    }
  }
}
