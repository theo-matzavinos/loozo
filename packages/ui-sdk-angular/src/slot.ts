import { isPlatformBrowser } from "@angular/common";
import {
  DestroyRef,
  ElementRef,
  HostAttributeToken,
  PLATFORM_ID,
  type Signal,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { Part, Primitive } from "@ui-sdk/core";
import {
  applyAttrs,
  attrs,
  bind,
  connect,
  handlers,
  partState,
  sameSlotState,
  selectedKeys,
  subscribe,
  takeOwnId,
} from "@ui-sdk/core/renderer";
import type { ɵUiSdkRoot } from "./root";

/** What a slot directive tells its slot besides its props. */
export type ɵUiSdkSlotOptions = {
  /** The event types the directive declares as static host listeners. */
  readonly events: readonly string[];
  /** The prop of kind `key`, which core keys the part by, through `api.internal.keyOf`. */
  readonly keyProp?: string;
};

/** An event a host listener received before its slot's first bind. */
type Queued = { readonly type: string; readonly event: Event };

/** Select's adapter-facing key mapping; only components with a `key`-kind prop have it. */
type Keyed = { readonly api: { readonly internal: { keyOf(value: unknown): string } } };

/**
 * One core part on the directive's host element: its props, its attributes (written on the
 * server and in the browser), its binding, and the events that reach it before it binds.
 */
export class ɵUiSdkSlot<S extends object> {
  /** The part for the current props, re-acquired when they change. */
  readonly part: Signal<Part>;
  /** What core's render functions get for this part. */
  readonly state: Signal<S>;
  readonly #send: (type: string, event: Event) => void;
  readonly #release: () => void;
  readonly #queue: Queued[] = [];
  #bound = false;

  constructor(
    root: ɵUiSdkRoot<Primitive>,
    slot: string,
    readProps: () => object,
    { events, keyProp }: ɵUiSdkSlotOptions,
  ) {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const authoredId = inject(new HostAttributeToken("id"), { optional: true });
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const channel = `ng:${root.id}:${slot}`;
    const version = signal(0);

    const props = computed(
      () => {
        const value: Record<string, unknown> = { ...readProps() };

        if (keyProp !== undefined) {
          // Core maps values to keys by the options it has, like Select's `itemToValue`, so the
          // key follows the root's handovers, not its inputs.
          root.handovers();

          const instance = root.instance() as unknown as Keyed;

          value["id"] = instance.api.internal.keyOf(value[keyProp]);
        }

        return value;
      },
      { equal: sameProps },
    );

    // Props are read tracked, so a change re-acquires the part; only core's work is untracked,
    // where a core listener that notifies during delivery may write signals.
    this.part = computed(() => {
      const next = props();
      const instance = root.instance();

      return untracked(() => {
        const record = instance.part(slot, next);

        takeOwnId(record, authoredId);

        return record;
      });
    });

    // Reads the root's revision, not its inputs: core's API-derived fields, like the value's
    // label, change once core has the new options or another slot's new props.
    this.state = computed(
      () => {
        version();
        root.revision();

        return partState(this.part(), props()) as S;
      },
      { equal: sameSlotState },
    );

    const write = () => {
      const record = this.part();
      const values = props();

      root.revision();
      version();
      untracked(() => applyAttrs(element, attrs(record, values), channel));
    };

    effect(write);

    // Delivers changed props to core, then tells the other slots: a same-key update keeps the
    // part, so nothing else would notice. The first delivery is the initial render, which every
    // slot makes anyway, so it doesn't count: initial and server-rendered attributes stay as core
    // first computes them.
    let delivered = false;

    effect(() => {
      props();
      this.part();

      if (!delivered) {
        delivered = true;

        return;
      }

      untracked(() => root.delivered());
    });

    let unsubscribe: (() => void) | undefined;
    let unbind: (() => void) | undefined;
    let disconnect: (() => void) | undefined;
    const host = { by: "framework", attaches: events } as const;

    const bindTo = (record: Part) => {
      disconnect = connect(record, element);
      unbind = bind(record, element, host);
    };

    if (browser) {
      // Follows the current part: a new key moves the subscription and the binding in one run,
      // so no event lands between unbind and bind.
      effect(() => {
        const record = this.part();

        selectedKeys(record);
        untracked(() => {
          unsubscribe?.();

          if (this.#bound) {
            unbind?.();
            disconnect?.();
          }

          unsubscribe = subscribe(record, () => {
            version.update((current) => current + 1);
            write();
          });

          if (this.#bound) {
            bindTo(record);
            write();
          }
        });
      });

      // Every slot of a render pass binds in `write`, then each drains its queue in `read`.
      afterNextRender({
        write: () => {
          bindTo(this.part());
        },
        read: () => {
          this.#bound = true;

          for (const { type, event } of this.#queue.splice(0)) {
            this.#send(type, event);
          }
        },
      });
    }

    this.#send = (type, event) => {
      const handler = handlers(this.part())[type as keyof HTMLElementEventMap];

      handler?.(event);
    };

    let disposed = false;

    this.#release = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      unsubscribe?.();
      unbind?.();
      disconnect?.();
    };

    const unregister = root.register(this);

    inject(DestroyRef).onDestroy(() => {
      this.dispose();
      unregister();
    });
  }

  /**
   * Hands a host listener's event to core. Before the first bind it queues the event and reads
   * nothing, since the view's inputs and the root's `ngOnInit` may not have run yet.
   */
  dispatch(type: string, event: Event): void {
    if (!this.#bound) {
      this.#queue.push({ type, event });

      return;
    }

    this.#send(type, event);
  }

  /** Unsubscribes, unbinds and disconnects the current part. Idempotent. */
  dispose(): void {
    this.#release();
  }
}

function sameProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const names = Object.keys(a);

  if (names.length !== Object.keys(b).length) {
    return false;
  }

  for (const name of names) {
    if (!Object.is(a[name], b[name])) {
      return false;
    }
  }

  return true;
}

/**
 * Creates the slot for a slot directive. `props` reads its inputs and its internal and fixed
 * props under core's names; `events` lists the directive's static host listeners.
 */
export function ɵinjectSlot<S extends object>(
  root: ɵUiSdkRoot<Primitive>,
  slot: string,
  props: () => object,
  options: ɵUiSdkSlotOptions,
): ɵUiSdkSlot<S> {
  return new ɵUiSdkSlot<S>(root, slot, props, options);
}
