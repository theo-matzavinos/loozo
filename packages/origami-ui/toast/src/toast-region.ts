import {
  DOCUMENT,
  DestroyRef,
  Directive,
  ElementRef,
  PLATFORM_ID,
  Service,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { assertDuration, toastStore } from "./toaster";
import type {
  OrigamiToastRecord,
  OrigamiToaster,
  ToastEntry,
  ToastStore,
  ToasterRegion,
} from "./toaster";

/**
 * Effective region configuration, replaced as a whole rather than merged with unused defaults.
 * `T` is the bound toaster's toast data.
 */
export abstract class OrigamiToastRegionOptions<T> {
  /**
   * The toaster whose toasts this region shows. Read once, when the region registers in its
   * `ngOnInit`; binding another toaster later isn't followed. One region per toaster.
   */
  abstract readonly toaster: Signal<OrigamiToaster<T>>;
  /**
   * How long a toast without its own `duration` stays open, in milliseconds: a positive number up
   * to 2147483647, the longest `setTimeout` delay, or `Infinity`. Direct input default 5000. Read
   * when the region shows a toast; another value throws a `RangeError` then, and a throwing `add`
   * keeps nothing.
   */
  abstract readonly duration: Signal<number>;
  /**
   * How many toasts stay open at once: a positive integer or `Infinity`. Direct input default 3.
   * Read when the region shows a toast: when that takes the open toasts over it, the oldest open
   * one closes with its exit. Another value throws a `RangeError` then, and a throwing
   * `add` keeps nothing.
   */
  abstract readonly limit: Signal<number>;

  /**
   * Replaces the region's Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<T>(
    type: () => Type<OrigamiToastRegionOptions<T>> | AbstractType<OrigamiToastRegionOptions<T>>,
  ): Provider {
    return { provide: OrigamiToastRegionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all of the region's Options, without merging unused directive defaults, such as an
   * application-wide wrapper's duration and limit.
   * @param factory - Injection-context factory supplying `toaster`, `duration` and `limit`.
   *   Ordinary signals are valid.
   * @returns A local provider.
   */
  static provideFactory<T>(factory: () => OrigamiToastRegionOptions<T>): Provider {
    return { provide: OrigamiToastRegionOptions, useFactory: factory };
  }
}

/** A shown toast's time: what's left, and the running timeout while the region isn't paused. */
type Timer = { remaining: number; startedAt: number; handle: ReturnType<typeof setTimeout> | null };

/** A mounted Toast: its record's id, read live, and its element, for focus. */
type ToastPart = { readonly id: () => string; readonly element: HTMLElement };

/** Throws a `RangeError` unless `limit` is a positive integer or `Infinity`. */
function assertLimit(limit: number): void {
  if (limit !== Infinity && !(Number.isInteger(limit) && limit > 0)) {
    throw new RangeError(
      `A toast region's limit must be a positive integer or Infinity, not ${String(limit)}.`,
    );
  }
}

/**
 * @internal The nearest toast region: release, timers, pause, limit and focus for the one toaster
 * bound to it. Not exported as an application authoring API.
 */
@Service({ autoProvided: false })
export class ToastRegionContext<T> {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #document = inject(DOCUMENT);
  readonly #browser = !isPlatformServer(inject(PLATFORM_ID));
  readonly #options = injectDeferred<OrigamiToastRegionOptions<T>>(OrigamiToastRegionOptions);
  /** The bound toaster's records, set once at registration. */
  readonly #store = signal<ToastStore<T> | null>(null);
  readonly #timers = new Map<string, Timer>();
  readonly #toasts: ToastPart[] = [];
  #hovering = false;
  /**
   * What had focus before focus entered the region: recorded on a `focusin` from an element
   * outside, cleared on a `focusout` to one. A focus event without a `relatedTarget`, such as the
   * window's reactivation restoring focus, keeps it.
   */
  #returnTarget: HTMLElement | null = null;
  /** The pending per-frame check of a hold, while records are held. */
  #frame: number | null = null;
  #destroyed = false;

  readonly #region: ToasterRegion = {
    offer: () => this.#release(),
    close: (id) => this.close(id),
  };

  /** The shown records and those running their exit, newest first. */
  readonly toasts: Signal<readonly OrigamiToastRecord<T>[]> = computed(() => {
    const store = this.#store();

    if (store === null) {
      return [];
    }

    const records: OrigamiToastRecord<T>[] = [];
    const entries = store.entries();

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]!;

      if (entry.status !== "waiting") {
        records.push(entry.record);
      }
    }

    return records;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    destroyRef.onDestroy(() => {
      this.#destroyed = true;

      if (this.#frame !== null) {
        cancelAnimationFrame(this.#frame);
        this.#frame = null;
      }

      for (const timer of this.#timers.values()) {
        this.#stop(timer);
      }

      this.#timers.clear();
    });

    if (this.#browser) {
      const visibilityChanged = (): void => this.#synchronizePause();
      // `toggle` and `close` don't bubble: captured, they come from any dialog in the document.
      const dialogChanged = (event: Event): void => {
        if (event.target instanceof HTMLDialogElement) {
          this.#release();
        }
      };

      this.#document.addEventListener("visibilitychange", visibilityChanged);
      this.#document.addEventListener("toggle", dialogChanged, true);
      this.#document.addEventListener("close", dialogChanged, true);
      destroyRef.onDestroy(() => {
        this.#document.removeEventListener("visibilitychange", visibilityChanged);
        this.#document.removeEventListener("toggle", dialogChanged, true);
        this.#document.removeEventListener("close", dialogChanged, true);
      });
    }
  }

  /**
   * From the region's `ngOnInit`: reads the bound toaster once and registers with it, then
   * shows what is waiting. A second region on the same toaster throws.
   */
  register(destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    const store = toastStore(this.#options().toaster());

    store.register(this.#region, destroyRef);
    this.#store.set(store);
    untracked(() => this.#release());
  }

  /** Whether the record is shown and not closing: a Toast's `open`. Read in render. */
  open(id: string): boolean {
    const store = this.#store();

    if (store === null) {
      return false;
    }

    for (const entry of store.entries()) {
      if (entry.record.id === id) {
        return entry.status === "shown";
      }
    }

    return false;
  }

  /**
   * Closes a shown record, from its timer, the limit, a Close or the toaster. If its Toast
   * contains focus, focus moves right after the record turns closing, before its exit renders. A
   * record whose Toast hasn't registered yet, before Angular renders it, is dropped at once and
   * never renders.
   */
  close(id: string): void {
    const store = untracked(this.#store);

    if (this.#destroyed || store === null || store.find(id)?.status !== "shown") {
      return;
    }

    const timer = this.#timers.get(id);

    if (timer !== undefined) {
      this.#stop(timer);
      this.#timers.delete(id);
    }

    const toast = this.#toast(id);

    if (toast === null) {
      store.drop(id);

      return;
    }

    const focused = toast.element.contains(this.#document.activeElement);

    // Written before the focus move, whose listeners may destroy or replace the region: nothing
    // is written after it, and the exit renders only later.
    store.setStatus(id, "closing");

    if (focused) {
      this.#returnFocus(store, id);
    }
  }

  /**
   * A Toast's Presence settled closed, or the Toast left: its closing record is removed. Focus
   * still inside the toast moves first, as on close.
   */
  settled(id: string): void {
    const store = untracked(this.#store);

    if (this.#destroyed || store === null || store.find(id)?.status !== "closing") {
      return;
    }

    const toast = this.#toast(id);
    const focused = toast !== null && toast.element.contains(this.#document.activeElement);

    // As in `close`: the write comes before the focus move.
    store.drop(id);

    if (focused) {
      this.#returnFocus(store, id);
    }
  }

  /** Registers a Toast from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerToast(part: ToastPart, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#toasts.push(part);
    destroyRef.onDestroy(() => {
      const index = this.#toasts.indexOf(part);

      if (index !== -1) {
        this.#toasts.splice(index, 1);
      }

      // Without its Toast, a record can't finish an exit.
      this.settled(part.id());
      this.partRemoved();
    });
  }

  /**
   * A Toast's or a Close's view was destroyed. Focus inside it is lost without a `focusout`, so
   * the pause is synchronized again once Angular has removed its elements.
   */
  partRemoved(): void {
    queueMicrotask(() => this.#synchronizePause());
  }

  /** Region host `pointerenter` and `pointerleave`. */
  hover(hovering: boolean): void {
    this.#hovering = hovering;
    this.#synchronizePause();
  }

  /** Region host `focusin`. */
  focusIn(event: FocusEvent): void {
    const previous = event.relatedTarget;

    if (previous instanceof Node && !this.#host.contains(previous)) {
      this.#returnTarget = null;

      if (previous instanceof HTMLElement) {
        this.#returnTarget = previous;
      }
    }

    this.#synchronizePause(true);
  }

  /** Region host `focusout`. */
  focusOut(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (next instanceof Node && this.#host.contains(next)) {
      return;
    }

    // Focus left for another element; without one, as on a window blur, it may come back.
    if (next instanceof Node) {
      this.#returnTarget = null;
    }

    this.#synchronizePause(false);
  }

  /**
   * Shows every waiting record, oldest first, with its duration, then closes the oldest open
   * ones past the limit; while a modal dialog blocks the page, it holds them instead. Runs when
   * the toaster offers a record, when the region registers, on any dialog's `toggle` and `close`
   * and, while records are held, on every animation frame.
   */
  #release(): void {
    const store = untracked(this.#store);

    if (!this.#browser || this.#destroyed || store === null) {
      return;
    }

    const entries: ToastEntry<T>[] = [];

    for (const entry of store.entries()) {
      if (entry.status === "waiting") {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      return;
    }

    if (this.#held()) {
      return;
    }

    const waiting: string[] = [];
    const durations = new Map<string, number>();
    let fallback: number | null = null;

    for (const entry of entries) {
      if (entry.duration === null && fallback === null) {
        fallback = untracked(() => this.#options().duration());
        assertDuration(fallback, "A toast region's");
      }

      waiting.push(entry.record.id);
      durations.set(entry.record.id, entry.duration ?? fallback!);
    }

    const limit = untracked(() => this.#options().limit());

    assertLimit(limit);

    const paused = this.#paused();

    for (const id of waiting) {
      // A previous record's limit close moves focus, whose listeners may destroy or replace the
      // region, close this record or open a modal dialog.
      if (this.#destroyed || this.#held()) {
        return;
      }

      if (store.find(id)?.status !== "waiting") {
        continue;
      }

      const timer: Timer = { remaining: durations.get(id)!, startedAt: 0, handle: null };

      store.setStatus(id, "shown");
      this.#timers.set(id, timer);

      if (!paused) {
        this.#start(id, timer);
      }

      this.#enforceLimit(store, limit);
    }
  }

  /**
   * Whether a modal dialog blocks the page, which holds every waiting record. Everything outside
   * the topmost modal dialog is inert, this region too: a toast shown now would be unannounced
   * and out of reach, so it waits, with no time used, until none is left. While it holds, the
   * check runs again each frame: a dialog removed before its queued `toggle` and `close`
   * dispatch, as a closed Dialog's opener does, or removed without `close()`, sends none to the
   * document.
   */
  #held(): boolean {
    if (this.#document.querySelector("dialog:modal") === null) {
      return false;
    }

    if (this.#frame === null) {
      this.#frame = requestAnimationFrame(() => {
        this.#frame = null;
        this.#release();
      });
    }

    return true;
  }

  /**
   * Closes the oldest open record while more than `limit` are open, counting again before each
   * close: a close's focus move runs focus listeners, which may close or add records themselves.
   */
  #enforceLimit(store: ToastStore<T>, limit: number): void {
    for (;;) {
      if (this.#destroyed) {
        return;
      }

      const open = store.entries().filter((entry) => entry.status === "shown");

      if (open.length <= limit) {
        return;
      }

      const oldest = open[0]!.record.id;

      this.close(oldest);

      if (store.find(oldest)?.status === "shown") {
        return;
      }
    }
  }

  /**
   * Focus is in a closing toast: back to what had it before the region when no other toast stays
   * open and that element takes focus, else to the region host.
   */
  #returnFocus(store: ToastStore<T>, closing: string): void {
    let othersOpen = false;

    for (const entry of store.entries()) {
      if (entry.status === "shown" && entry.record.id !== closing) {
        othersOpen = true;
      }
    }

    const target = this.#returnTarget;

    if (!othersOpen && target !== null && target.isConnected) {
      target.focus();

      // Its focus listeners may have destroyed the region.
      if (this.#destroyed || this.#document.activeElement === target) {
        return;
      }
    }

    this.#host.focus();
  }

  #toast(id: string): ToastPart | null {
    for (const toast of this.#toasts) {
      if (toast.id() === id) {
        return toast;
      }
    }

    return null;
  }

  /**
   * Whether focus is inside the region, read live: removing a focused element dispatches no
   * `focusout`. A document without focus, behind another window, has none inside.
   */
  #focusWithin(): boolean {
    return this.#document.hasFocus() && this.#host.contains(this.#document.activeElement);
  }

  #paused(focusWithin = this.#focusWithin()): boolean {
    return this.#hovering || focusWithin || this.#document.hidden;
  }

  /** `focusWithin` comes from a `focusin` or `focusout`, which knows it better than a live read. */
  #synchronizePause(focusWithin?: boolean): void {
    if (this.#destroyed) {
      return;
    }

    const paused = this.#paused(focusWithin);

    for (const [id, timer] of this.#timers) {
      if (paused) {
        this.#stop(timer);
      } else if (timer.handle === null) {
        this.#start(id, timer);
      }
    }
  }

  /** Runs what's left of `timer`; `Infinity` never runs out. */
  #start(id: string, timer: Timer): void {
    if (timer.remaining === Infinity) {
      return;
    }

    timer.startedAt = performance.now();
    timer.handle = setTimeout(() => {
      timer.handle = null;
      this.close(id);
    }, timer.remaining);
  }

  /** Stops a running `timer`, keeping what's left of it. */
  #stop(timer: Timer): void {
    if (timer.handle === null) {
      return;
    }

    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining -= performance.now() - timer.startedAt;
  }
}

/** Locally provided readonly facade of the nearest toast region. */
@Service({ autoProvided: false })
export class OrigamiToastRegionState<T> {
  readonly #context = inject<ToastRegionContext<T>>(ToastRegionContext);

  /**
   * The toasts the region shows, newest first, including those still running their exit: render
   * them with `@for (toast of region.state.toasts(); track toast.id)`. Empty until the region
   * registers, on the server, and while toasts wait for the region. Readonly observation; never
   * writable.
   */
  readonly toasts: Signal<readonly OrigamiToastRecord<T>[]> = this.#context.toasts;
}

/**
 * The live region that renders one toaster's toasts, authored once, usually in the application's
 * root component, and present in server HTML before any toast exists. `T` is inferred from the
 * bound toaster. The consumer renders `state.toasts()` with an `[ogToast]` per record and names
 * the region with `aria-label` or `aria-labelledby`.
 *
 * Host: `role="region"`, `aria-live="polite"`, `aria-relevant="additions text"`,
 * `aria-atomic="false"` and `tabindex="-1"`, in server HTML too. Adding a toast to the list is its
 * announcement; every toast is polite.
 *
 * - **Timers.** Each toast closes after its `duration`, its own or the region's, counted from
 *   when the region shows it. The region pauses every toast while the pointer is over it, while
 *   focus is inside it and while the document is hidden, and resumes each with its remaining
 *   time. A window that merely loses focus doesn't pause it.
 * - **Limit.** When showing a toast takes the open toasts over `limit`, the oldest open one
 *   closes with its exit.
 * - **Focus.** A toast never takes focus. When a toast that contains focus closes, focus moves
 *   before its exit: to what had focus before focus entered the region, when no other toast
 *   stays open and it takes focus; otherwise to the region, from which Tab reaches the other
 *   toasts' controls. A closing toast is `inert` while its exit runs, so Tab skips it.
 * - **Modal dialogs.** While a modal `<dialog>` blocks the page (`dialog:modal` matches), the
 *   page and this region are inert, so toasts added then wait, using no time, and are shown once
 *   no modal dialog is left, checked again on every dialog's `toggle` and `close` and, while
 *   toasts wait, on every animation frame, which also catches a dialog removed from the
 *   document. A Dialog's exit keeps it modal, so a toast added as it closes appears after its
 *   native `close()`, when focus is back. Toasts shown before a dialog opens stay, inert under
 *   it, and keep their time.
 * - **Lifetime.** Toasts added before the region registers, or while it is still dehydrated in
 *   a `@defer` block, are shown once it registers. Destroying the region sends its shown toasts
 *   back to waiting, with their full duration, and drops the ones running their exit. A second
 *   region bound to the same toaster throws when it registers.
 *
 * @example
 * ```html
 * <section [ogToastRegion]="toasts" #region="ogToastRegion" aria-label="Notifications">
 *   <ol>
 *     @for (toast of region.state.toasts(); track toast.id) {
 *       <li [ogToast]="toast">
 *         <p>{{ toast.data.title }}</p>
 *         <button ogToastClose aria-label="Close">×</button>
 *       </li>
 *     }
 *   </ol>
 * </section>
 * ```
 */
@Directive({
  selector: "[ogToastRegion]",
  exportAs: "ogToastRegion",
  providers: [
    ToastRegionContext,
    OrigamiToastRegionState,
    OrigamiToastRegionOptions.provideExisting(() => OrigamiToastRegion),
  ],
  host: {
    role: "region",
    "aria-live": "polite",
    "aria-relevant": "additions text",
    "aria-atomic": "false",
    tabindex: "-1",
    "(pointerenter)": "hover(true)",
    "(pointerleave)": "hover(false)",
    "(focusin)": "focusIn($event)",
    "(focusout)": "focusOut($event)",
  },
})
export class OrigamiToastRegion<T> implements OrigamiToastRegionOptions<T> {
  /**
   * Own required input, `[ogToastRegion]="toasts"`: the toaster this region shows, an instance of
   * the application's `OrigamiToaster` subclass. Read once, at registration. Replaced Options
   * supply the effective toaster instead.
   */
  readonly toaster = input.required<OrigamiToaster<T>>({ alias: "ogToastRegion" });
  /**
   * Own input: the duration of a toast without its own, in milliseconds, default 5000; a positive
   * number up to 2147483647 or `Infinity`. Replaced Options supply the effective duration instead.
   */
  readonly duration = input(5000);
  /**
   * Own input: how many toasts stay open at once, default 3; a positive integer or `Infinity`.
   * Replaced Options supply the effective limit instead.
   */
  readonly limit = input(3);
  /** This region's readonly observation, shared with its descendants. */
  readonly state = inject<OrigamiToastRegionState<T>>(OrigamiToastRegionState);

  readonly #context = inject<ToastRegionContext<T>>(ToastRegionContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Registers with the bound toaster once Angular has set the inputs, then shows what waits. */
  ngOnInit(): void {
    this.#context.register(this.#destroyRef);
  }

  /** @internal Region host `pointerenter` and `pointerleave`. */
  protected hover(hovering: boolean): void {
    this.#context.hover(hovering);
  }

  /** @internal Region host `focusin`. */
  protected focusIn(event: FocusEvent): void {
    this.#context.focusIn(event);
  }

  /** @internal Region host `focusout`. */
  protected focusOut(event: FocusEvent): void {
    this.#context.focusOut(event);
  }
}
