import { isPlatformBrowser } from "@angular/common";
import {
  type AfterRenderRef,
  DestroyRef,
  ElementRef,
  HostAttributeToken,
  Injector,
  PLATFORM_ID,
  type Signal,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { Attrs, Part, Primitive } from "@ui-sdk/core";
import {
  applyAttrs,
  attrs,
  bind,
  connect,
  handlers,
  partState,
  present,
  sameSlotState,
  selectedKeys,
  subscribe,
  takeOwnId,
} from "@ui-sdk/core/renderer";
import { UiSdkError } from "./error";
import type { ɵUiSdkRoot } from "./root";

/** What a slot directive tells its slot besides its props. */
export type ɵUiSdkSlotOptions = {
  /** The event types the directive declares as static host listeners. */
  readonly events: readonly string[];
  /** The prop of kind `key`, which core keys the part by, through `api.internal.keyOf`. */
  readonly keyProp?: string;
  /**
   * Runs after each write of core's attributes to the host, on the server and in the browser, in
   * the same run, with what was written: for a native property core's attributes don't carry.
   * It touches only its own element's properties and never writes signals, since it can run
   * inside core's notification.
   */
  readonly afterWrite?: (written: Attrs) => void;
  /**
   * The part renders on an element a structural directive hands in with `mount()`, not on the
   * directive's host: nothing is written or bound until then. For a part core can leave out of
   * the page, like a closed panel.
   */
  readonly mounts?: boolean;
};

/**
 * A slot's root: the root directive's, or a reader of another element's, for a part outside its
 * root's element tree, like a checkbox's hidden input beside its button.
 */
export type ɵUiSdkRootRef = ɵUiSdkRoot<Primitive> | (() => ɵUiSdkRoot<Primitive>);

/** Select's adapter-facing key mapping; only components with a `key`-kind prop have it. */
type Keyed = { readonly api: { readonly internal: { keyOf(value: unknown): string } } };

/**
 * One element the slot renders on, from `mount()` (or construction, for the host) to `unmount()`:
 * its one scheduled bind, the binding it made, and whether events reach core yet.
 */
type Mount = {
  readonly element: HTMLElement;
  /** The element's authored `id`, which core takes as the part's own. */
  readonly authoredId: string | null;
  /** The one scheduled bind; undefined on the server, once it ran, or after unmount. */
  pending: AfterRenderRef | undefined;
  /** The part bound on `element` and how to undo it; set by the write phase that bound it. */
  bound: { readonly record: Part; readonly release: () => void } | undefined;
  /**
   * Events and `afterBind` callbacks reach core: set in the bind's read phase, once every slot
   * of the render pass has bound in the write phase.
   */
  delivering: boolean;
};

/**
 * One core part on the directive's host element, or on the element a structural directive mounts:
 * its props, its attributes (written on the server and in the browser), its binding, and the
 * events that reach it before it binds.
 */
export class ɵUiSdkSlot<S extends object> {
  /** The part for the current props, re-acquired when they change. */
  readonly part: Signal<Part>;
  /** What core's render functions get for this part. */
  readonly state: Signal<S>;
  /**
   * Whether core has the part in the page for its current props and state: core's `present()`,
   * true for a part without a presence rule.
   */
  readonly present: Signal<boolean>;
  /** Core's slot name, which the root counts its parts by. */
  readonly slotName: string;
  readonly #send: (type: string, event: Event) => void;
  readonly #release: () => void;
  readonly #mountOn: (mount: Mount) => void;
  /** What arrived before delivery started, in order: events for core, and `afterBind` callbacks. */
  readonly #queue: (() => void)[] = [];
  /** The element the part renders on now. A plain field: nothing reacts to it. */
  #mount: Mount | null = null;

  constructor(
    rootRef: ɵUiSdkRootRef,
    slot: string,
    readProps: () => object,
    { events, keyProp, afterWrite, mounts = false }: ɵUiSdkSlotOptions,
  ) {
    const injector = inject(Injector);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    const version = signal(0);
    let resolved: ɵUiSdkRoot<Primitive> | undefined;
    let unregister: (() => void) | undefined;

    this.slotName = slot;

    // A reader is resolved on the first read, once Angular has set the inputs it reads, and kept:
    // the slot stays with the root it registered with.
    const root = (): ɵUiSdkRoot<Primitive> => {
      if (resolved === undefined) {
        resolved = typeof rootRef === "function" ? untracked(rootRef) : rootRef;
        unregister = resolved.register(this);
      }

      return resolved;
    };

    if (typeof rootRef !== "function") {
      root();
    }

    const props = computed(
      () => {
        const value: Record<string, unknown> = { ...readProps() };

        if (keyProp !== undefined) {
          // Core maps values to keys by the options it has, like Select's `itemToValue`, so the
          // key follows the root's handovers, not its inputs.
          root().handovers();

          const instance = root().instance() as unknown as Keyed;

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
      const instance = root().instance();

      return untracked(() => {
        const record = instance.part(slot, next);

        takeOwnId(record, this.#mount?.authoredId ?? null);

        return record;
      });
    });

    // Reads the root's revision, not its inputs: core's API-derived fields, like the value's
    // label, change once core has the new options or another slot's new props.
    this.state = computed(
      () => {
        version();
        root().revision();

        return partState(this.part(), props()) as S;
      },
      { equal: sameSlotState },
    );

    this.present = computed(() => {
      version();
      root().revision();

      return present(this.part(), props());
    });

    const write = () => {
      // Reactive reads first, with or without a mount: the effect must depend on what the
      // attributes are computed from even while the part isn't in the page, or a panel mounted
      // later is never rewritten when its props or the root's revision change.
      const record = this.part();
      const values = props();

      root().revision();
      version();

      const mount = this.#mount;

      if (mount === null) {
        return;
      }

      untracked(() => {
        const written = attrs(record, values);

        applyAttrs(mount.element, written, `ng:${root().id}:${slot}`);
        afterWrite?.(written);
      });
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

      untracked(() => root().delivered());
    });

    let unsubscribe: (() => void) | undefined;
    const host = { by: "framework", attaches: events } as const;

    const bindTo = (mount: Mount, record: Part) => {
      const disconnect = connect(record, mount.element);
      const unbind = bind(record, mount.element, host);

      mount.bound = {
        record,
        release: () => {
          unbind();
          disconnect();
        },
      };
    };

    // Every slot of a render pass binds in `write`, then each starts delivering in `read`: Angular
    // runs a phase for every sequence before the next phase, so an event one sequence's `write`
    // dispatches waits until the slots registered after it have bound too.
    const scheduleBind = (mount: Mount) => {
      mount.pending = afterNextRender(
        {
          write: () => {
            if (this.#mount !== mount) {
              return;
            }

            bindTo(mount, this.part());
            mount.pending = undefined;
          },
          read: () => {
            if (this.#mount !== mount || mount.bound === undefined) {
              return;
            }

            mount.delivering = true;

            for (const run of this.#queue.splice(0)) {
              run();
            }
          },
        },
        { injector },
      );
    };

    // A mounted element gets its attributes in the same task as its insertion, so it has them by
    // the first frame; the host's first write is the write effect's.
    this.#mountOn = (mount) => {
      this.#mount = mount;
      takeOwnId(untracked(this.part), mount.authoredId);
      write();

      if (browser) {
        scheduleBind(mount);
      }
    };

    if (browser) {
      // Follows the current part: a new key moves the subscription and the binding in one run,
      // so no event lands between unbind and bind. A mount whose bind is still pending binds
      // whatever part is current when its write phase runs.
      effect(() => {
        const record = this.part();

        selectedKeys(record);
        untracked(() => {
          unsubscribe?.();

          const mount = this.#mount;
          const bound = mount?.bound;

          bound?.release();
          unsubscribe = subscribe(record, () => {
            version.update((current) => current + 1);
            write();
          });

          if (mount !== null && bound !== undefined) {
            bindTo(mount, record);
            write();
          }
        });
      });
    }

    if (!mounts) {
      const hostMount: Mount = {
        element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
        authoredId: inject(new HostAttributeToken("id"), { optional: true }),
        pending: undefined,
        bound: undefined,
        delivering: false,
      };

      this.#mount = hostMount;

      if (browser) {
        scheduleBind(hostMount);
      }
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
      this.unmount();
    };

    inject(DestroyRef).onDestroy(() => {
      this.dispose();
      unregister?.();
    });
  }

  /**
   * Renders the part on `element` from now on, for a slot made with `mounts`: writes core's
   * attributes now (server and browser) and, in the browser, binds after this render. A second
   * call needs an `unmount()` first.
   */
  mount(element: HTMLElement): void {
    if (this.#mount !== null) {
      throw new UiSdkError("ɵUiSdkSlot.mount() called twice without unmount()");
    }

    this.#mountOn({
      element,
      authoredId: element.getAttribute("id"),
      pending: undefined,
      bound: undefined,
      delivering: false,
    });
  }

  /**
   * Stops rendering on the mounted element: cancels a bind that hasn't run, or unbinds and
   * disconnects one that has. Call it before destroying the element's view.
   */
  unmount(): void {
    const mount = this.#mount;

    // Cleared first, so core's notifications during the unbind write nothing.
    this.#mount = null;
    mount?.pending?.destroy();
    mount?.bound?.release();
  }

  /**
   * Hands a host listener's event to core. Before delivery starts it queues the event and reads
   * nothing, since the view's inputs and the root's `ngOnInit` may not have run yet, and the
   * render pass's other parts may not have bound.
   */
  dispatch(type: string, event: Event): void {
    if (this.#mount?.delivering !== true) {
      this.#queue.push(() => this.#send(type, event));

      return;
    }

    this.#send(type, event);
  }

  /**
   * Runs `run` now, or, before delivery starts, queues it with the events, for a directive's own
   * listener that reads the slot's state, which isn't readable before the first bind.
   */
  afterBind(run: () => void): void {
    if (this.#mount?.delivering !== true) {
      this.#queue.push(run);

      return;
    }

    run();
  }

  /** Unsubscribes, then unmounts as `unmount()` does. Idempotent. */
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
 * Creates the slot for a slot directive. `root` is its root, or a reader of one another element
 * holds, read once; `props` reads its inputs and its internal and fixed props under core's names;
 * `events` lists the directive's static host listeners, and `mounts` makes a slot for a
 * structural directive's element.
 */
export function ɵinjectSlot<S extends object>(
  root: ɵUiSdkRootRef,
  slot: string,
  props: () => object,
  options: ɵUiSdkSlotOptions,
): ɵUiSdkSlot<S> {
  return new ɵUiSdkSlot<S>(root, slot, props, options);
}
