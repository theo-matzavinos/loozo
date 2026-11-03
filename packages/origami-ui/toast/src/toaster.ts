import { PLATFORM_ID, inject, signal, untracked } from "@angular/core";
import type { DestroyRef, Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";

/** Origami's own per-toast options: timing only. Everything a toast shows is its `data`. */
export interface OrigamiToastAddOptions {
  /**
   * How long the toast stays open once its region shows it, in milliseconds: a positive number,
   * or `Infinity` to stay until it's closed. Default: the region's `duration`, read when the
   * region shows the toast. The time runs only while the region isn't paused.
   */
  duration?: number;
}

/** One toast as its region renders it: immutable, created by `add`. */
export interface OrigamiToastRecord<T> {
  /**
   * The id `add` returned, `og-toast-<n>`, unique in the application. Pass it to `close`; it is
   * never rendered as a DOM `id`.
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
  /** Closes a shown record: moves focus out of it, stops its time and starts its exit. */
  close(id: string): void;
}

/** Application-wide, so a toast id never matches a toast of another toaster. */
let allocated = 0;

/** Throws a `RangeError` unless `duration` is a positive number of milliseconds or `Infinity`. */
export function assertDuration(duration: number, owner: string): void {
  if (typeof duration !== "number" || !(duration > 0)) {
    throw new RangeError(
      `${owner} duration must be a positive number of milliseconds or Infinity, not ${String(duration)}.`,
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

  add(data: T, duration: number | null): string {
    if (duration !== null) {
      assertDuration(duration, "A toast's");
    }

    allocated += 1;

    const id = `og-toast-${allocated}`;

    // A notification has no meaning in server HTML: nothing is kept, so the id matches nothing.
    if (this.#server) {
      return id;
    }

    untracked(() => {
      this.#entries.update((entries) => [
        ...entries,
        { record: { id, data }, duration, status: "waiting" },
      ]);

      // The region's invalid duration or limit throws before its release changes anything; the
      // caller never gets this id, so the record goes too and the failed add keeps nothing.
      try {
        this.#region?.offer();
      } catch (error) {
        this.drop(id);

        throw error;
      }
    });

    return id;
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
 * region, they wait for the application's lifetime. On the server `add` keeps nothing: server
 * HTML never contains a toast.
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
 * ```
 */
export abstract class OrigamiToaster<T> {
  readonly #store = new ToastStore<T>();

  constructor() {
    stores.set(this, this.#store);
  }

  /**
   * Adds a toast. Its region shows it at once, newest first, or once the region mounts or
   * hydrates; its time starts then. When that takes the open toasts over the region's `limit`,
   * the oldest open one closes. Callable from any context, also inside an effect; writes are
   * untracked.
   * @param data - What the toast shows, kept by reference as the record's `data`.
   * @param options - Timing: a `duration` of its own instead of the region's.
   * @returns The toast's id, for `close`. On the server nothing is kept and the id matches
   *   nothing.
   * @throws `RangeError` for a `duration` that isn't a positive number or `Infinity`, also on the
   *   server, and for a registered region's invalid `duration` or `limit`. A throwing `add` keeps
   *   nothing.
   */
  add(data: T, { duration }: OrigamiToastAddOptions = {}): string {
    return this.#store.add(data, duration ?? null);
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
