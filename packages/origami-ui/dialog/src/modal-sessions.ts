import { DOCUMENT, Service, inject } from "@angular/core";
import type { ɵOrigamiLayer } from "@loozo/origami-ui/utils";

/** The longhands `overflow` sets, snapshotted one by one: the shorthand reads empty unless both match. */
const axes = ["overflow-x", "overflow-y"] as const;

type Declaration = { readonly axis: string; readonly value: string; readonly priority: string };

/** @internal What a Dialog reads from a mounted Dialog Content, another one's included. */
export interface ModalDialog {
  /** Its dismissal layer, whose modal scope is the Dialog it's nested in. */
  readonly layer: ɵOrigamiLayer;
  /** Not destroyed, and its root requests it open. */
  requested(): boolean;
  /** Ends a native session still running its exit at once, without the rest of the exit. */
  endExit(): void;
}

/**
 * @internal The application's mounted Dialog Contents and their active Origami modal sessions, in
 * opening order. While at least one session is active, `<html>` has `overflow: hidden`, and its
 * previous inline `overflow-x` and `overflow-y`, each with its priority, come back when the last
 * one ends; nested dialogs share that one lock. The newest session is the one the browser blocks
 * the page with.
 */
@Service()
export class ModalSessions {
  readonly #root = inject(DOCUMENT).documentElement;
  readonly #dialogs = new Set<ModalDialog>();
  readonly #sessions = new Set<object>();
  #previous: readonly Declaration[] | null = null;

  /** Registers a Dialog Content at construction, until its teardown. */
  register(dialog: ModalDialog): void {
    this.#dialogs.add(dialog);
  }

  unregister(dialog: ModalDialog): void {
    this.#dialogs.delete(dialog);
  }

  /**
   * The Dialog Contents nested in the Dialog whose layer is `layer`: those whose modal scope it
   * is, from the DOM now, wherever they are declared. Read when its session ends.
   */
  nestedIn(layer: ɵOrigamiLayer): ModalDialog[] {
    const nested: ModalDialog[] = [];

    for (const dialog of this.#dialogs) {
      if (dialog.layer.scope() === layer) {
        nested.push(dialog);
      }
    }

    return nested;
  }

  /** Starts holding the lock for `session`, which becomes the topmost. */
  hold(session: object): void {
    if (this.#sessions.size === 0) {
      const style = this.#root.style;

      this.#previous = axes.map((axis) => ({
        axis,
        value: style.getPropertyValue(axis),
        priority: style.getPropertyPriority(axis),
      }));
      style.setProperty("overflow", "hidden");
    }

    this.#sessions.add(session);
  }

  /** Stops holding it; the last release restores the previous inline longhands. */
  release(session: object): void {
    if (!this.#sessions.delete(session) || this.#sessions.size > 0) {
      return;
    }

    const previous = this.#previous!;

    this.#previous = null;

    for (const { axis, value, priority } of previous) {
      this.#root.style.setProperty(axis, value, priority);
    }
  }

  /** Whether `session` is the newest active one, which the page is blocked by. */
  isTopmost(session: object): boolean {
    let last: object | null = null;

    for (const active of this.#sessions) {
      last = active;
    }

    return last === session;
  }
}
