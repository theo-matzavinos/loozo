import {
  DOCUMENT,
  DestroyRef,
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
import { moveFor, reachable, searchable, targetOf } from "./roving-targets";
import type { Member } from "./roving-targets";
import { ɵmatchTypeahead } from "./typeahead";

/**
 * Whether `element` has focus, also in an open shadow root, where the document's `activeElement`
 * is the shadow host. Browser only.
 */
function hasFocus(element: HTMLElement): boolean {
  const root = element.getRootNode();

  return "activeElement" in root && root.activeElement === element;
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
 * A widget root provides it locally with `ɵOrigamiRovingFocusOptions`. Each item registers in
 * `ngOnInit`, so render reads only see members whose inputs are set, and forwards its host
 * events by element. The Context keeps its registered members and sorts them by DOM position on
 * every read. It owns one roving tab stop, arrow/Home/End movement
 * with wrapping, disabled skipping and focus repair. A disabled member that registers as
 * focusable stays a move target and can hold the tab stop, but a move onto it is no navigation.
 * It does not select, activate or use `aria-activedescendant`; a widget that acts on a keyboard
 * move subscribes to `navigations`. A widget that enters at an edge or searches by typeahead,
 * such as a Menu, calls `focusEdge` and `search`; the others never do, and members that register
 * no `label` aren't searched.
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
   * A keyboard move landed on this value while it is focused, registered and enabled, after its
   * focus handlers ran; never after focus repair. Emits synchronously inside the keydown handler.
   */
  readonly navigations: Observable<string> = this.#navigations.asObservable();

  /**
   * The focused member that can take focus; otherwise the first enabled preferred member, then
   * the first enabled member, then the first focusable disabled member.
   */
  readonly #tabStop = computed<Member | null>(() => {
    const ordered = this.#ordered();
    const focused = this.#focused();

    if (focused !== null && ordered.includes(focused) && reachable(focused)) {
      return focused;
    }

    const preferred = this.#options().preferred();
    let firstEnabled: Member | null = null;
    let firstFocusable: Member | null = null;

    for (const member of ordered) {
      if (member.disabled()) {
        if (firstFocusable === null && member.focusable()) {
          firstFocusable = member;
        }

        continue;
      }

      if (preferred.includes(member.value())) {
        return member;
      }

      if (firstEnabled === null) {
        firstEnabled = member;
      }
    }

    return firstEnabled ?? firstFocusable;
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

      // A member that turns disabled but stays focusable keeps focus.
      if (this.#members().includes(focused) && reachable(focused)) {
        return;
      }

      const active = this.#document.activeElement;
      const lost = active === null || active === this.#document.body || hasFocus(focused.element);
      const target = this.#tabStop();

      this.#focused.set(null);

      // Never steal focus the application already moved elsewhere.
      if (lost && target !== null) {
        target.element.focus();
      }
    });
  }

  /** @internal The element holding the roving tab stop, or null when no member can take focus. */
  readonly tabStop: Signal<HTMLElement | null> = computed(() => this.#tabStop()?.element ?? null);

  /**
   * @internal Adds an item host to the members, unless its view is already destroyed (a hook
   * earlier in its view can destroy the view before the item's `ngOnInit` runs). Called from the
   * item's `ngOnInit`, after its inputs are set; its `destroyRef` removes it.
   * @param item - `value` matches the root's preferred values and is what `navigations` emits;
   *   `disabled` items are never navigations or preferred, and are targets or tab stops only
   *   while `focusable`. `label`, read when a key is pressed, is the item's typeahead text for
   *   `search`; without one the item isn't searched.
   */
  register(
    item: {
      readonly element: HTMLElement;
      readonly value: Signal<string>;
      readonly disabled: Signal<boolean>;
      readonly focusable: Signal<boolean>;
      readonly label?: () => string;
    },
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    const member: Member = {
      element: item.element,
      value: item.value,
      disabled: item.disabled,
      focusable: item.focusable,
      label: item.label ?? null,
    };

    this.#members.update((members) => [...members, member]);
    destroyRef.onDestroy(() => {
      const remaining: Member[] = [];

      for (const mounted of this.#members()) {
        if (mounted !== member) {
          remaining.push(mounted);
        }
      }

      this.#members.set(remaining);
    });
  }

  /** @internal An item host's `keydown`; ignored unless `element` is a registered member. */
  keydown(element: HTMLElement, event: KeyboardEvent): void {
    const member = this.#memberOf(element);

    if (member !== null) {
      this.#keydown(member, event);
    }
  }

  /** @internal An item host's `focus`; ignored unless `element` is a registered member. */
  focus(element: HTMLElement): void {
    const member = this.#memberOf(element);

    if (member !== null) {
      this.#focused.set(member);
    }
  }

  /** @internal An item host's `blur`; only the focused member's blur can clear the focus record. */
  blur(element: HTMLElement): void {
    const member = this.#focused();

    if (member === null || member.element !== element) {
      return;
    }

    // Engines differ on blur during removal or disabling; a still-connected host that can take
    // focus and no longer has it after the current task's synchronous work is a genuine
    // departure, a removed or natively disabled one awaits repair, and one focused again in the
    // meantime keeps its record.
    queueMicrotask(() => {
      const departed = member.element.isConnected && reachable(member) && !hasFocus(member.element);

      if (this.#focused() === member && departed) {
        this.#focused.set(null);
      }
    });
  }

  /**
   * @internal Focuses the first or last member that can take focus, a focusable disabled one
   * included, in current DOM order; event time and after render only. Reads membership, so a
   * reactive caller runs again when members register.
   * @returns Whether a member took focus.
   */
  focusEdge(edge: "first" | "last"): boolean {
    const target = targetOf(this.#ordered(), null, edge);

    if (target === null) {
      return false;
    }

    target.element.focus();

    return hasFocus(target.element);
  }

  /**
   * @internal The member a typeahead search lands on: the first, in current DOM order from
   * `from`'s member and wrapping, whose `label` starts with `text`, case-insensitively, among
   * the members that can take focus, focusable disabled ones included. One character, or one
   * character repeated, starts after `from`, so repeating it cycles. Event time only; it moves
   * no focus.
   * @param from - The focused element; one that isn't a member searches from the first.
   * @returns The member's element, or null without a match.
   */
  search(text: string, from: HTMLElement | null): HTMLElement | null {
    let active: Member | null = null;

    if (from !== null) {
      active = this.#memberOf(from);
    }

    const match = ɵmatchTypeahead(searchable(this.#ordered()), active, text, (member) => {
      // `searchable` keeps only members with a label.
      return member.label?.() ?? "";
    });

    return match?.element ?? null;
  }

  #memberOf(element: HTMLElement): Member | null {
    for (const member of this.#members()) {
      if (member.element === element) {
        return member;
      }
    }

    return null;
  }

  /** Registered members in current DOM order. */
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

    // Focus handlers run inside focus(): navigate only to a target still registered, enabled and
    // focused. A focusable disabled target takes focus but is no navigation.
    const registered = this.#members().includes(target);

    if (registered && !target.disabled() && hasFocus(target.element)) {
      this.#navigations.next(target.value());
    }
  }
}
