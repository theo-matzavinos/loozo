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
import type { Provider, Signal } from "@angular/core";
import { Subject } from "rxjs";
import type { Observable } from "rxjs";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { documentOrder } from "./document-order";

/** A widget's arrow keys: one orientation, or `both` for a widget with no orientation (RadioGroup). */
type Orientation = "horizontal" | "vertical" | "both";
type Move = "next" | "previous" | "first" | "last";

/** One item host: its element and the value and disabled state it publishes. */
type Member = {
  readonly element: HTMLElement;
  readonly value: Signal<string>;
  readonly disabled: Signal<boolean>;
};

/** One item's unpublished handle: its tab stop observation, host event handlers and `publish`. */
type RovingItem = {
  readonly tabStop: Signal<boolean>;
  keydown(event: KeyboardEvent): void;
  focus(): void;
  blur(): void;
  /**
   * Adds the item to the published members unless its host is already destroyed; called from
   * `ngOnInit`, after its inputs are set.
   */
  publish(): void;
};

/**
 * Maps a key to a move. Horizontal arrows follow reading direction; vertical arrows ignore it.
 * `both` takes the vertical and the horizontal arrows.
 */
function moveFor(key: string, orientation: Orientation, rtl: boolean): Move | null {
  if (key === "Home") {
    return "first";
  }

  if (key === "End") {
    return "last";
  }

  if (orientation !== "horizontal") {
    if (key === "ArrowDown") {
      return "next";
    }

    if (key === "ArrowUp") {
      return "previous";
    }
  }

  if (orientation === "vertical") {
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

/** Walks DOM order from `current`, skipping disabled members and wrapping at both ends. */
function targetOf(ordered: readonly Member[], current: Member, move: Move): Member | null {
  const enabled: Member[] = [];

  for (const member of ordered) {
    if (!member.disabled()) {
      enabled.push(member);
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
 * @internal Package-private roving focus policy, supplied by the widget root that provides
 * `ɵOrigamiRovingFocusContext`. Not an application API.
 */
export abstract class ɵOrigamiRovingFocusOptions {
  /** The arrow keys that move focus; horizontal arrows follow reading direction. */
  abstract readonly orientation: Signal<"horizontal" | "vertical" | "both">;
  /** Values that should hold the tab stop when no item is focused (Tabs: the selected value). */
  abstract readonly preferred: Signal<readonly string[]>;

  /**
   * @internal Provides the policy beside its Context on the widget root.
   * @param factory - Runs in the root's injection context the first time the Context reads it.
   * @returns A one-provider local array.
   */
  static provideFactory(factory: () => ɵOrigamiRovingFocusOptions): Provider[] {
    return [{ provide: ɵOrigamiRovingFocusOptions, useFactory: factory }];
  }
}

/**
 * @internal Package-private ordered focus for Origami composite widgets; not an application API.
 *
 * A widget root provides it locally with `ɵOrigamiRovingFocusOptions`. Each item takes an
 * unpublished handle from its own injection context and publishes it in `ngOnInit`, so render
 * reads only see members whose inputs are set. The Context keeps its published members and
 * sorts them by DOM position on every read. It owns one roving tab stop, arrow/Home/End movement
 * with wrapping, disabled skipping and focus repair. It does not select, activate, typeahead or
 * use `aria-activedescendant`; a widget that acts on a keyboard move subscribes to `navigations`.
 */
@Service({ autoProvided: false })
export class ɵOrigamiRovingFocusContext {
  readonly #options = injectDeferred(ɵOrigamiRovingFocusOptions);
  readonly #document = inject(DOCUMENT);
  readonly #members = signal<readonly Member[]>([]);
  /** The member that last received focus, kept through removal so repair can see it. */
  readonly #focused = signal<Member | null>(null);
  readonly #navigations = new Subject<string>();

  /**
   * A keyboard move landed on this value while it is focused, published and enabled, after its
   * focus handlers ran; never after focus repair. Emits synchronously inside the keydown handler.
   */
  readonly navigations: Observable<string> = this.#navigations.asObservable();

  /** The focused enabled member; otherwise the first enabled preferred member, then the first enabled member. */
  readonly #tabStop = computed(() => {
    const ordered = this.#ordered();
    const focused = this.#focused();

    if (focused !== null && ordered.includes(focused) && !focused.disabled()) {
      return focused;
    }

    const preferred = this.#options().preferred();
    let firstEnabled: Member | null = null;

    for (const member of ordered) {
      if (member.disabled()) {
        continue;
      }

      if (preferred.includes(member.value())) {
        return member;
      }

      if (firstEnabled === null) {
        firstEnabled = member;
      }
    }

    return firstEnabled;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#navigations.complete();
    });

    // Browser-only: render effects never run on the server.
    afterRenderEffect(() => {
      const focused = this.#focused();

      if (focused === null) {
        return;
      }

      if (this.#members().includes(focused) && !focused.disabled()) {
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
   * @internal Creates the calling item host's unpublished handle from its injection context.
   * Caller-scoped `DestroyRef` cleanup, attached now, removes only it. Publishing adds it to the
   * members, unless the host was already destroyed (a hook earlier in its view can destroy the
   * view before the item's `ngOnInit` runs).
   * @param item - `value` matches the root's preferred values and is what `navigations` emits;
   *   `disabled` items are never targets or tab stops.
   * @returns The item's tab stop observation, the handlers its host events forward to and `publish`.
   */
  item(item: { readonly value: Signal<string>; readonly disabled: Signal<boolean> }): RovingItem {
    const member: Member = {
      element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      value: item.value,
      disabled: item.disabled,
    };
    let destroyed = false;
    let published = false;

    inject(DestroyRef).onDestroy(() => {
      destroyed = true;

      if (!published) {
        return;
      }

      const remaining: Member[] = [];

      for (const mounted of this.#members()) {
        if (mounted !== member) {
          remaining.push(mounted);
        }
      }

      this.#members.set(remaining);
    });

    return {
      tabStop: computed(() => this.#tabStop() === member),
      keydown: (event) => {
        this.#keydown(member, event);
      },
      focus: () => {
        this.#focused.set(member);
      },
      blur: () => {
        // Engines differ on blur during removal or disabling; a still-connected, enabled host
        // that no longer has focus after the current task's synchronous work is a genuine
        // departure, a removed or disabled one awaits repair, and one focused again in the
        // meantime keeps its record.
        queueMicrotask(() => {
          const departed =
            member.element.isConnected &&
            !member.disabled() &&
            this.#document.activeElement !== member.element;

          if (this.#focused() === member && departed) {
            this.#focused.set(null);
          }
        });
      },
      publish: () => {
        if (destroyed) {
          return;
        }

        published = true;
        this.#members.update((members) => [...members, member]);
      },
    };
  }

  /** Published members in current DOM order. */
  #ordered(): readonly Member[] {
    const ordered = [...this.#members()];

    ordered.sort((left, right) => documentOrder(left.element, right.element));

    return ordered;
  }

  #keydown(member: Member, event: KeyboardEvent): void {
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
      rtl = view.getComputedStyle(member.element).direction === "rtl";
    }

    const move = moveFor(event.key, this.#options().orientation(), rtl);

    if (move === null) {
      return;
    }

    event.preventDefault();

    const target = targetOf(this.#ordered(), member, move);

    if (target === null) {
      return;
    }

    // A move onto the focused item still navigates to it.
    if (target !== member) {
      target.element.focus();
    }

    // Focus handlers run inside focus(): navigate only to a target still published, enabled and focused.
    const published = this.#members().includes(target);

    if (published && !target.disabled() && this.#document.activeElement === target.element) {
      this.#navigations.next(target.value());
    }
  }
}
