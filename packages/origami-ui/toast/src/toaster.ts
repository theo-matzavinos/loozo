import { PLATFORM_ID, inject, signal, untracked } from "@angular/core";
import type { DestroyRef, Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";

/** Origami's own per-toast options: the toast's id and its timing. Everything a toast shows is its `data`. */
export interface OrigamiToastAddOptions {
  /**
   * The toast's id. Adding with the id of a toast that's waiting or shown replaces it in place,
   * in the same position, and a shown one's time restarts; one running its exit counts as closed,
   * so a new toast with that id is added as the newest. Scoped to this toaster. A non-empty
   * string; `undefined` is the same as omitting it, and anything else throws a `TypeError`.
   */
  id?: string;
  /**
   * How long the toast stays open once its region shows it, in milliseconds: a positive number
   * up to 2147483647 (about 24.8 days, the longest `setTimeout` delay), or `Infinity` to stay
   * until it's closed. Another value throws a `RangeError`. Default: the region's `duration`, read
   * when the region shows the toast, or when a replacement restarts a shown one. The time runs
   * only while the region isn't paused.
   */
  duration?: number;
}

/** One toast as its region renders it: immutable, created by `add`. */
export interface OrigamiToastRecord<T> {
  /**
   * The id you gave `add`, else a generated `og-toast-<n>`. Generated ids are unique in the
   * application and skip an id this toaster holds; an id you give is scoped to its toaster. Pass
   * it to `close`; it is never rendered as a DOM `id`.
   */
  readonly id: string;
  /**
   * What `add` was given, by reference: Origami never reads, copies or freezes it. Mutating it
   * after `add` changes what a later render shows, and Angular doesn't track that mutation.
   */
  readonly data: T;
}

/** Where a toast is in its life: waiting for a region, shown by it, or running its exit. */
type ToastStatus = "waiting" | "shown" | "closing";

/** @internal A toast's record with its timing and lifecycle state; replaced, never mutated. */
export interface ToastEntry<T> {
  readonly record: OrigamiToastRecord<T>;
  /** The toast's own duration, or null for the region's, read when the region shows it. */
  readonly duration: number | null;
  readonly status: ToastStatus;
}

/** @internal What a toaster asks of the region registered with it. */
export interface ToasterRegion {
  /** Records are waiting: shows them now, unless the region holds them. */
  offer(): void;
  /**
   * A shown record is replaced: validates its effective duration, then restarts its time. Throws
   * before any change.
   */
  restart(id: string, duration: number | null): void;
  /** Closes a shown record: moves focus out of it, stops its time and starts its exit. */
  close(id: string): void;
}

/** Application-wide, so a generated id never matches a generated id of another toaster. */
let allocated = 0;

/** The longest delay `setTimeout` runs as given; a longer one overflows and runs at once. */
const maximumDuration = 2_147_483_647;

/**
 * Throws a `RangeError` unless `duration` is a positive number of milliseconds up to
 * 2147483647, the longest `setTimeout` delay, or `Infinity`.
 */
export function assertDuration(duration: number, owner: string): void {
  const valid =
    typeof duration === "number" &&
    (duration === Infinity || (duration > 0 && duration <= maximumDuration));

  if (!valid) {
    throw new RangeError(
      `${owner} duration must be a positive number of milliseconds up to ${maximumDuration}, or Infinity, not ${String(duration)}.`,
    );
  }
}

/**
 * @internal A toaster's records and its one region. Written by `add` and `close` from any
 * context, untracked, and by its region; read by the region's Context, its State and its Toasts.
 */
export class ToastStore<T> {
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  /** In the order they were added, oldest first. */
  readonly #entries = signal<readonly ToastEntry<T>[]>([]);
  #region: ToasterRegion | null = null;

  readonly entries: Signal<readonly ToastEntry<T>[]> = this.#entries.asReadonly();

  /**
   * Adds a waiting record, or replaces the waiting or shown one with `id` in its slot; a closing
   * one counts as closed: it is dropped and a new record with `id` is added as newest.
   */
  add(data: T, duration: number | null, id: string | undefined): string {
    if (duration !== null) {
      assertDuration(duration, "A toast's");
    }

    // Not coerced or interpolated: an object's `toString` could throw or call the toaster.
    if (id !== undefined && (typeof id !== "string" || id === "")) {
      throw new TypeError("A toast's id must be a non-empty string.");
    }

    const key = id ?? this.#generate();

    // A notification has no meaning in server HTML: nothing is kept, so the id matches nothing.
    if (this.#server) {
      return key;
    }

    untracked(() => {
      const entries = this.#entries();
      const index = entries.findIndex((entry) => entry.record.id === key);
      const current = entries[index];
      const record: OrigamiToastRecord<T> = { id: key, data };

      if (current?.status === "waiting") {
        // Waiting for a region, or held by a modal: swapped, and not offered.
        this.#put(index, { record, duration, status: "waiting" });

        return;
      }

      if (current?.status === "shown") {
        // A shown record exists only while a region is registered; its destruction sends the
        // record back to waiting. `restart` throws before it changes anything.
        this.#region!.restart(key, duration);
        this.#put(index, { record, duration, status: "shown" });

        return;
      }

      const entry: ToastEntry<T> = { record, duration, status: "waiting" };
      let closing: ToastEntry<T> | null = null;
      let kept = entries;

      if (current !== undefined) {
        closing = current;
        kept = [...entries.slice(0, index), ...entries.slice(index + 1)];
      }

      this.#entries.set([...kept, entry]);

      // The region's invalid duration or limit throws before its release changes anything.
      try {
        this.#region?.offer();
      } catch (error) {
        this.#undo(entry, closing, index);

        throw error;
      }
    });

    return key;
  }

  /** The next `og-toast-<n>`, skipping an id this toaster holds in any status. */
  #generate(): string {
    for (;;) {
      allocated += 1;

      const candidate = `og-toast-${allocated}`;

      if (this.find(candidate) === null) {
        return candidate;
      }
    }
  }

  /** Writes `entry` at `index`, in place of the entry there. */
  #put(index: number, entry: ToastEntry<T>): void {
    const next = [...untracked(this.#entries)];

    next[index] = entry;
    this.#entries.set(next);
  }

  /**
   * A failed offer: removes this add's own entry and puts back the closing entry it replaced, by
   * identity, keeping every other write made meanwhile.
   */
  #undo(entry: ToastEntry<T>, closing: ToastEntry<T> | null, index: number): void {
    let entries = untracked(this.#entries);

    // Still this very object: the release never wrote it (`setStatus` replaces it), nor did a swap.
    if (entries.includes(entry)) {
      entries = entries.filter((other) => other !== entry);
    }

    // Back only if no record with its id is left: one another write put there stays.
    if (closing !== null && !entries.some((other) => other.record.id === closing.record.id)) {
      entries = [...entries.slice(0, index), closing, ...entries.slice(index)];
    }

    this.#entries.set(entries);
  }

  close(id: string): void {
    untracked(() => {
      const entry = this.find(id);

      if (entry === null) {
        return;
      }

      if (entry.status === "waiting") {
        this.drop(id);

        return;
      }

      if (entry.status === "shown") {
        this.#region?.close(id);
      }
    });
  }

  /**
   * From the region's `ngOnInit`, unless its view is already destroyed; a second region fails.
   * Destroying the region sends its shown records back to waiting with their full duration and
   * drops the ones running their exit.
   */
  register(region: ToasterRegion, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (this.#region !== null) {
      throw new Error("A toaster supports only one mounted toast region.");
    }

    this.#region = region;
    destroyRef.onDestroy(() => {
      if (this.#region !== region) {
        return;
      }

      this.#region = null;

      const kept: ToastEntry<T>[] = [];

      for (const entry of untracked(this.#entries)) {
        if (entry.status === "shown") {
          kept.push({ ...entry, status: "waiting" });
        }

        if (entry.status === "waiting") {
          kept.push(entry);
        }
      }

      this.#entries.set(kept);
    });
  }

  find(id: string): ToastEntry<T> | null {
    for (const entry of untracked(this.#entries)) {
      if (entry.record.id === id) {
        return entry;
      }
    }

    return null;
  }

  /** The region's release and close: a new status for one record. */
  setStatus(id: string, status: ToastStatus): void {
    const next: ToastEntry<T>[] = [];

    for (const entry of untracked(this.#entries)) {
      if (entry.record.id === id) {
        next.push({ ...entry, status });
      } else {
        next.push(entry);
      }
    }

    this.#entries.set(next);
  }

  drop(id: string): void {
    const next: ToastEntry<T>[] = [];

    for (const entry of untracked(this.#entries)) {
      if (entry.record.id !== id) {
        next.push(entry);
      }
    }

    this.#entries.set(next);
  }
}

const stores = new WeakMap<OrigamiToaster<unknown>, ToastStore<unknown>>();

/** @internal The records of `toaster`, for its region. */
export function toastStore<T>(toaster: OrigamiToaster<T>): ToastStore<T> {
  const store = stores.get(toaster);

  if (store === undefined) {
    throw new Error("A toast region needs an instance of an OrigamiToaster subclass.");
  }

  // Each toaster registers its own store at construction, typed by the same T.
  return store as ToastStore<T>;
}

/**
 * Holds the toasts of one kind, typed by the consumer's data `T`, and opens and closes them from
 * code: a component, an effect, a functional HTTP interceptor or a service. It has no decorator
 * and `T` has no default: declare an application service that names `T` once, and bind it to the
 * one `[ogToastRegion]` that renders its toasts.
 *
 * A toast outlives what raised it: the caller's destruction and router navigation don't close
 * it. Toasts added before the region mounts or hydrates wait for it and are shown then; with no
 * region, they wait for the application's lifetime. Toasts added while a modal dialog blocks the
 * page wait until it closes. On the server `add` keeps nothing: server HTML never contains a
 * toast.
 *
 * @example
 * ```ts
 * export interface AppToast {
 *   title: string;
 *   description?: string;
 *   kind: "success" | "info" | "warning" | "error";
 * }
 *
 * @Service()
 * export class AppToasts extends OrigamiToaster<AppToast> {}
 *
 * // Anywhere in the application:
 * inject(AppToasts).add({ title: "Todo created", kind: "success" });
 * // One toast per id: a second add with "app-update" replaces the first in place.
 * inject(AppToasts).add({ title: "Update ready", kind: "info" }, { id: "app-update" });
 * ```
 */
export abstract class OrigamiToaster<T> {
  readonly #store = new ToastStore<T>();

  constructor() {
    stores.set(this, this.#store);
  }

  /**
   * Adds a toast. Its region shows it at once, newest first, or once the region mounts or
   * hydrates, and while a modal dialog blocks the page, once none is left; its time starts then.
   * When that takes the open toasts over the region's `limit`, the oldest open one closes. With
   * the `id` of a toast that's waiting or shown, it replaces that toast in place instead, and a
   * shown one's time restarts; one running its exit counts as closed, and the new toast is added.
   * Callable from any context, also inside an effect; writes are untracked.
   * @param data - What the toast shows, kept by reference as the record's `data`.
   * @param options - The toast's `id`, to replace the open toast with that id, and a `duration`
   *   of its own instead of the region's.
   * @returns The given id, else the generated one, for `close`. On the server nothing is kept and
   *   the id matches nothing.
   * @throws `TypeError` for an `id` that isn't a non-empty string, and `RangeError` for a
   *   `duration` that isn't a positive number up to 2147483647 or `Infinity`, both also on the
   *   server, and for a registered region's invalid `duration` or `limit` when it reads them: a
   *   release that isn't held reads both, a shown toast's replacement only `duration` and only
   *   without its own, and a release held by a modal dialog neither. An `add` that throws for an
   *   invalid input or configuration keeps nothing and changes no existing toast; another
   *   exception during a release, such as one thrown by a Toast's `toast` Options signal that a
   *   limit close reads, propagates and can leave that release partly done. A focus listener's
   *   exception doesn't: the browser reports it and the release goes on.
   */
  add(data: T, { id, duration }: OrigamiToastAddOptions = {}): string {
    return this.#store.add(data, duration ?? null, id);
  }

  /**
   * Closes a toast: one still waiting for its region is dropped; a shown one runs its exit and is
   * then removed, and if it contains focus, focus moves first (see `OrigamiToastRegion`). One
   * closed before its `ogToast` registered, before Angular renders it, such as right after `add`,
   * is dropped and never renders. An unknown id, or one already closing or closed, does nothing.
   * @param id - The id `add` returned.
   */
  close(id: string): void {
    this.#store.close(id);
  }
}
