import { DestroyRef, afterRenderEffect, computed, inject, signal } from "@angular/core";
import type { Signal } from "@angular/core";
import { moveActiveOption } from "./active-option";
import type { ActiveOptionMove } from "./active-option";
import { documentOrder } from "./document-order";

/**
 * @internal Package-private, exported for the listbox widgets; not an application API. What an
 * option registers with `ɵOrigamiListbox` from its `ngOnInit`; every signal reads the option's
 * own effective Options. A widget extends it with its own fields, such as the value and label.
 */
export interface ɵOrigamiListboxOption {
  readonly element: HTMLElement;
  /** The option's DOM ID, which the focused element's `aria-activedescendant` names while it is active. */
  readonly id: Signal<string>;
  /** A disabled option is skipped by moves and ignored by the pointer. */
  readonly disabled: Signal<boolean>;
}

/**
 * @internal Package-private, exported for the listbox widgets. A keyboard or opening activation
 * the list scrolls into view; a new object every time, so activating the same option again
 * scrolls again.
 */
export interface ɵOrigamiListboxReveal<O> {
  readonly option: O;
}

/** Whether `element` scrolls its block axis: its content overflows and `overflow-y` clips it. */
function scrolls(element: HTMLElement): boolean {
  const overflow = getComputedStyle(element).overflowY;

  return (
    element.scrollHeight > element.clientHeight && overflow !== "visible" && overflow !== "clip"
  );
}

/** Scrolls the option's nearest scrolling box inside `content`, else `content`, to show it. */
function scroll(option: HTMLElement, content: HTMLElement): void {
  let box = option.parentElement;

  while (box !== null && box !== content && !scrolls(box)) {
    box = box.parentElement;
  }

  if (box === null) {
    return;
  }

  const bounds = box.getBoundingClientRect();
  const top = bounds.top + box.clientTop;
  const bottom = top + box.clientHeight;
  const rect = option.getBoundingClientRect();

  if (rect.top < top) {
    box.scrollTop -= top - rect.top;
  } else if (rect.bottom > bottom) {
    box.scrollTop += rect.bottom - bottom;
  }
}

/**
 * @internal Package-private active-descendant listbox core for Origami's listbox widgets (Select);
 * not an application API.
 *
 * A widget's private Context constructs one, in its injection context, and holds it: the core
 * owns the option registrations, the active option and the pending reveal; the Context keeps the
 * widget's policy (where opening puts the active option, choosing, the value, forms, typeahead
 * and keys). Focus stays on the widget's own element, which names the active option with
 * `aria-activedescendant`. The active option is set by events only: `activate` and `move` for
 * keys and opening, which also request a scroll, and `point` for the pointer, which doesn't. An
 * option that unregisters stops being active. Options are ordered by DOM position at the event,
 * so options added or moved by `@for`, `@if` and `@defer` are reached where they render.
 */
export class ɵOrigamiListbox<O extends ɵOrigamiListboxOption> {
  readonly #participating: () => boolean;
  readonly #options = signal<readonly O[]>([]);
  readonly #active = signal<O | null>(null);
  readonly #reveal = signal<ɵOrigamiListboxReveal<O> | null>(null);
  #destroyed = false;

  /** Registered options in registration order. */
  readonly options = this.#options.asReadonly();
  /** The active option while it is registered; never the value. */
  readonly active = computed(() => {
    const active = this.#active();

    if (active !== null && this.#options().includes(active)) {
      return active;
    }

    return null;
  });
  /** The active option while the list participates: what the widget and its options expose. */
  readonly highlighted = computed(() => {
    if (!this.#participating()) {
      return null;
    }

    return this.active();
  });
  /** The focused element's `aria-activedescendant`: the highlighted option's ID. */
  readonly activeDescendant = computed(() => this.highlighted()?.id() ?? null);
  /** The latest activation to scroll into view, or null. */
  readonly reveal = this.#reveal.asReadonly();

  /**
   * Runs in the holding Context's injection context; the core stops answering the pointer when
   * that context is destroyed.
   * @param participating - Reads, reactively, whether the list is presented and interactive,
   *   such as its composed Popover Content's native participation. Only then is the active option
   *   highlighted and does the pointer activate options.
   */
  constructor(participating: () => boolean) {
    this.#participating = participating;
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * Registers an option from its `ngOnInit`, unless its view is already destroyed; `destroyRef`
   * removes exactly this registration.
   */
  register(option: O, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#options.update((options) => [...options, option]);
    destroyRef.onDestroy(() => {
      this.#options.update((options) => {
        const remaining: O[] = [];

        for (const registered of options) {
          if (registered !== option) {
            remaining.push(registered);
          }
        }

        return remaining;
      });
    });
  }

  /** Registered options in current DOM order; read at the event. */
  ordered(): O[] {
    return [...this.#options()].sort((left, right) => documentOrder(left.element, right.element));
  }

  /**
   * Makes `option` active from a key or an opening and requests a scroll to it; null clears the
   * active option and any pending scroll.
   */
  activate(option: O | null): void {
    this.#active.set(option);

    if (option === null) {
      this.#reveal.set(null);

      return;
    }

    this.#reveal.set({ option });
  }

  /**
   * Moves the active option by the shared rules (enabled options only, no wrapping, pages of ten)
   * and requests a scroll; nothing when no option is enabled.
   */
  move(move: ActiveOptionMove): void {
    const target = moveActiveOption(this.ordered(), this.active(), move);

    if (target !== null) {
      this.activate(target);
    }
  }

  /** A pointer moved over an option: it becomes active, without scrolling, while the list participates and the option is enabled. */
  point(option: O): void {
    if (!this.#destroyed && this.#participating() && !option.disabled()) {
      this.#active.set(option);
    }
  }

  /**
   * Scrolls every reveal into view after render, once `ready` is true so the list has its final
   * size and position: the option's nearest scrolling box inside `content`, else `content`
   * itself, by `scrollTop`, never the page. Call it once, in the list element's injection
   * context.
   * @param content - The list element.
   * @param ready - Reads, reactively, whether the list is revealed, such as its floating
   *   presentation's `ready()`.
   */
  scrollReveals(content: HTMLElement, ready: () => boolean): void {
    afterRenderEffect(() => {
      const reveal = this.#reveal();

      if (reveal !== null && ready()) {
        scroll(reveal.option.element, content);
      }
    });
  }
}
