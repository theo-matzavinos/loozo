import {
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Service,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Signal } from "@angular/core";
import { CollectionContext } from "./collection";

type Orientation = "horizontal" | "vertical";
/** A widget's arrow keys: one orientation, or `both` for a widget with no orientation (RadioGroup). */
type Axis = Orientation | "both";
type Move = "next" | "previous" | "first" | "last";

/** One item's tab stop observation and the handlers its host events forward to. */
type Registration = {
  readonly tabStop: Signal<boolean>;
  keydown(event: KeyboardEvent, axis: Axis): void;
  focus(): void;
  blur(): void;
};

type Entry = {
  readonly element: HTMLElement;
  readonly disabled: Signal<boolean>;
  readonly preferred: Signal<boolean>;
  readonly navigated: () => void;
};

/**
 * Maps a key to a move. Horizontal arrows follow reading direction; vertical arrows ignore it.
 * `both` takes the vertical and the horizontal arrows.
 */
function moveFor(key: string, axis: Axis, rtl: boolean): Move | null {
  if (key === "Home") {
    return "first";
  }

  if (key === "End") {
    return "last";
  }

  if (axis !== "horizontal") {
    if (key === "ArrowDown") {
      return "next";
    }

    if (key === "ArrowUp") {
      return "previous";
    }
  }

  if (axis === "vertical") {
    return null;
  }

  if (key === "ArrowRight") {
    if (rtl) {
      return "previous";
    }

    return "next";
  }

  if (key === "ArrowLeft") {
    if (rtl) {
      return "next";
    }

    return "previous";
  }

  return null;
}

/** Walks DOM order from `current`, skipping disabled entries and wrapping at both ends. */
function targetOf(ordered: readonly Entry[], current: Entry, move: Move): Entry | null {
  const enabled: Entry[] = [];

  for (const entry of ordered) {
    if (!entry.disabled()) {
      enabled.push(entry);
    }
  }

  if (enabled.length === 0) {
    return null;
  }

  if (move === "first") {
    return enabled[0];
  }

  if (move === "last") {
    return enabled[enabled.length - 1];
  }

  const start = ordered.indexOf(current);

  if (start === -1) {
    return null;
  }

  let step = 1;

  if (move === "previous") {
    step = -1;
  }

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const index = (((start + step * offset) % ordered.length) + ordered.length) % ordered.length;
    const candidate = ordered[index];

    if (!candidate.disabled()) {
      return candidate;
    }
  }

  return null;
}

/**
 * @internal Package-private ordered focus for Origami composite widgets; not an application API.
 *
 * Provide it locally on a widget root that composes `OrigamiCollection`; each item composes
 * `OrigamiCollectionItem` and registers from its own injection context. DOM order comes from
 * that Collection. The core owns one roving tab stop, arrow/Home/End movement with wrapping,
 * disabled skipping and focus repair. It does not select, activate, typeahead or use
 * `aria-activedescendant`; the widget decides what a preferred item and a navigation mean.
 * Items of a nested selection group can `join` an enclosing owner's core instead of their own.
 */
@Service({ autoProvided: false })
export class ɵOrigamiRovingFocus {
  readonly #collection = inject(CollectionContext);
  readonly #document = inject(DOCUMENT);
  readonly #entries = signal<ReadonlyMap<Element, Entry>>(new Map());
  /** The item that last received focus, kept through removal so repair can see it. */
  readonly #focused = signal<Entry | null>(null);

  readonly #ordered = computed(() => {
    const entries = this.#entries();
    const ordered: Entry[] = [];

    for (const element of this.#collection.elements()) {
      const entry = entries.get(element);

      if (entry !== undefined) {
        ordered.push(entry);
      }
    }

    return ordered;
  });

  /** The focused enabled item; otherwise the first enabled preferred item, then the first enabled item. */
  readonly #tabStop = computed(() => {
    const ordered = this.#ordered();
    const focused = this.#focused();

    if (focused !== null && ordered.includes(focused) && !focused.disabled()) {
      return focused;
    }

    let firstEnabled: Entry | null = null;

    for (const entry of ordered) {
      if (entry.disabled()) {
        continue;
      }

      if (entry.preferred()) {
        return entry;
      }

      if (firstEnabled === null) {
        firstEnabled = entry;
      }
    }

    return firstEnabled;
  });

  constructor() {
    // Browser-only: render effects never run on the server.
    afterRenderEffect(() => {
      const focused = this.#focused();

      if (focused === null) {
        return;
      }

      const mounted = this.#entries().get(focused.element) === focused;

      if (mounted && !focused.disabled()) {
        return;
      }

      const active = this.#document.activeElement;
      const lost = active === null || active === this.#document.body || active === focused.element;
      const target = this.#tabStop();

      this.#focused.set(null);

      // Never steal focus the application already moved elsewhere.
      if (lost && target !== null) {
        target.element.focus();
      }
    });
  }

  /**
   * @internal Registers the calling item host from its injection context, with caller-scoped
   * `DestroyRef` cleanup removing only this registration.
   * @param item - `disabled` items are never targets or tab stops; `preferred` marks the widget's
   *   preferred tab stop (Tabs: selected); `navigated` runs on the target after a keyboard move
   *   focuses it, or lands on the already focused item, and it is still registered, enabled and
   *   focused (Tabs: select while automatic; RadioGroup: check), never after focus repair.
   * @returns The item's tab stop observation and the handlers its host events forward to.
   * @throws If the item's nearest Collection is not this core's owner Collection.
   */
  register(item: {
    readonly disabled: Signal<boolean>;
    readonly preferred: Signal<boolean>;
    readonly navigated: () => void;
  }): Registration {
    if (inject(CollectionContext) !== this.#collection) {
      throw new Error("Roving focus item must belong to its owner's Collection.");
    }

    return this.#add(item);
  }

  /**
   * @internal Registers the calling item host of a nested selection group (a ToggleGroup or
   * RadioGroup inside a Toolbar) from its injection context. The host also becomes a member of
   * this owner's Collection, so it is ordered among the owner's own items in rendered DOM order,
   * also after server refreshes confined to the group's descendant views. A joined item is never
   * preferred, so the owner's tab stop falls on its first enabled item.
   * @param item - As for `register`, without `preferred`.
   * @returns As for `register`.
   */
  join(item: { readonly disabled: Signal<boolean>; readonly navigated: () => void }): Registration {
    this.#collection.join();

    return this.#add({ ...item, preferred: computed(() => false) });
  }

  /** Adds the calling host's entry with caller-scoped cleanup. */
  #add(item: {
    readonly disabled: Signal<boolean>;
    readonly preferred: Signal<boolean>;
    readonly navigated: () => void;
  }): Registration {
    const entry: Entry = {
      element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      disabled: item.disabled,
      preferred: item.preferred,
      navigated: item.navigated,
    };

    this.#entries.update((entries) => new Map(entries).set(entry.element, entry));
    inject(DestroyRef).onDestroy(() => {
      const entries = new Map(this.#entries());

      if (entries.get(entry.element) === entry) {
        entries.delete(entry.element);
        this.#entries.set(entries);
      }
    });

    return {
      tabStop: computed(() => this.#tabStop() === entry),
      keydown: (event, axis) => {
        this.#keydown(entry, event, axis);
      },
      focus: () => {
        this.#focused.set(entry);
      },
      blur: () => {
        // Engines differ on blur during removal or disabling; a still-connected, enabled host
        // that no longer has focus after the current task's synchronous work is a genuine
        // departure, a removed or disabled one awaits repair, and one focused again in the
        // meantime keeps its record.
        queueMicrotask(() => {
          const departed =
            entry.element.isConnected &&
            !entry.disabled() &&
            this.#document.activeElement !== entry.element;

          if (this.#focused() === entry && departed) {
            this.#focused.set(null);
          }
        });
      },
    };
  }

  #keydown(entry: Entry, event: KeyboardEvent, axis: Axis): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    const view = this.#document.defaultView;
    let rtl = false;

    if (view !== null) {
      rtl = view.getComputedStyle(entry.element).direction === "rtl";
    }

    const move = moveFor(event.key, axis, rtl);

    if (move === null) {
      return;
    }

    event.preventDefault();

    const target = targetOf(this.#ordered(), entry, move);

    if (target === null) {
      return;
    }

    // A move onto the focused item still navigates to it.
    if (target !== entry) {
      target.element.focus();
    }

    // Focus handlers run inside focus(): navigate only to a target still mounted, enabled and focused.
    const mounted = this.#entries().get(target.element) === target;

    if (mounted && !target.disabled() && this.#document.activeElement === target.element) {
      target.navigated();
    }
  }
}

/**
 * @internal Package-private: provided by an owner whose nested selection groups join its roving
 * focus (Toolbar), and cut with a null value where a subtree must not join (Popover Content).
 * Not an application API.
 */
export abstract class ɵOrigamiRovingFocusScope {
  /** The owner's roving focus, which joined items register with through `join`. */
  abstract readonly focus: ɵOrigamiRovingFocus;
  /** The owner's effective axis; joined items navigate along it instead of their group's. */
  abstract readonly orientation: Signal<Orientation>;
}
