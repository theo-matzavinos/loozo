import { DOCUMENT, Service, inject } from "@angular/core";
import { ɵdeepActiveElement } from "@loozo/origami-ui/utils";
import type { ɵOrigamiLayer } from "@loozo/origami-ui/utils";

/** The longhands `overflow` sets, snapshotted one by one: the shorthand reads empty unless both match. */
const axes = ["overflow-x", "overflow-y"] as const;

type Declaration = { readonly axis: string; readonly value: string; readonly priority: string };

/**
 * @internal A session's place in the focus-return chain, from `hold`; `release` hands it to the
 * session for its focus return. An ended one stays reachable only through the `below` of newer
 * sessions stacked on it, so it's dropped with the last of them.
 */
export interface ModalReturn {
  /** When it was held, among all sessions: a larger one is newer. */
  readonly held: number;
  /** The deep active element at `showModal()`, what the browser restores at its close; never the body. */
  readonly target: HTMLElement | SVGElement | null;
  /** The topmost session's when it was held: the one it was stacked on. */
  readonly below: ModalReturn | null;
  /** Read at its close while a newer session still blocked the page; tried before its target. */
  returnFocus: HTMLElement | null;
}

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
 * the page with. Each session's return record chains to the one it was stacked on, so focus can
 * return down the stack whatever order the sessions end in.
 */
@Service()
export class ModalSessions {
  readonly #document = inject(DOCUMENT);
  readonly #root = this.#document.documentElement;
  readonly #dialogs = new Set<ModalDialog>();
  // In holding order; only active sessions, so an ended record is held by the chain alone.
  readonly #sessions = new Map<object, ModalReturn>();
  #held = 0;
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

  /**
   * Starts holding the lock for `session`, which becomes the topmost, just before its
   * `showModal()`: records the focused element and the session it is stacked on.
   */
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

    let below: ModalReturn | null = null;

    for (const record of this.#sessions.values()) {
      below = record;
    }

    const active = ɵdeepActiveElement(this.#document);
    let target: HTMLElement | SVGElement | null = null;

    if (
      (active instanceof HTMLElement || active instanceof SVGElement) &&
      active !== this.#document.body
    ) {
      target = active;
    }

    this.#sessions.set(session, { held: this.#held, target, below, returnFocus: null });
    this.#held += 1;
  }

  /**
   * Stops holding it and returns its record, for its focus return; the last release restores
   * the previous inline longhands.
   */
  release(session: object): ModalReturn {
    const record = this.#sessions.get(session)!;

    this.#sessions.delete(session);

    if (this.#sessions.size > 0) {
      return record;
    }

    const previous = this.#previous!;

    this.#previous = null;

    for (const { axis, value, priority } of previous) {
      this.#root.style.setProperty(axis, value, priority);
    }

    return record;
  }

  /**
   * Where focus may return now that the released session `ended` has closed natively, in order:
   * its own target, then down the chain each session it was stacked on, ended or not, with the
   * `returnFocus` read at that one's close before its target. Whether one takes focus is tried,
   * not predicted. `null` while a newer session still blocks the page, where nothing could take
   * focus: `returnFocus` is kept for a newer session's chain to reach.
   */
  returnTargets(
    ended: ModalReturn,
    returnFocus: HTMLElement | null,
  ): (HTMLElement | SVGElement)[] | null {
    for (const record of this.#sessions.values()) {
      if (record.held > ended.held) {
        ended.returnFocus = returnFocus;

        return null;
      }
    }

    const targets: (HTMLElement | SVGElement)[] = [];

    if (ended.target !== null) {
      targets.push(ended.target);
    }

    for (let record = ended.below; record !== null; record = record.below) {
      if (record.returnFocus !== null) {
        targets.push(record.returnFocus);
      }

      if (record.target !== null) {
        targets.push(record.target);
      }
    }

    return targets;
  }

  /** Whether `session` is the newest active one, which the page is blocked by. */
  isTopmost(session: object): boolean {
    let last: object | null = null;

    for (const active of this.#sessions.keys()) {
      last = active;
    }

    return last === session;
  }
}
