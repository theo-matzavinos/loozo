import { DOCUMENT, DestroyRef, Service, effect, inject, signal, untracked } from "@angular/core";
import type { Signal } from "@angular/core";
import { ɵOrigamiRovingFocusContext, ɵTypeaheadBuffer } from "@loozo/origami-ui/collection";
import { ɵflatTreeContains } from "@loozo/origami-ui/utils";
import { MenuContext } from "./menu-context";
import type { MenuEntry } from "./menu-context";

/** What an item registers from its `ngOnInit`; every signal reads its effective Options. */
export interface MenuItemRegistration {
  readonly element: HTMLElement;
  /** A disabled item stays focusable, is searched and never activates. */
  readonly disabled: Signal<boolean>;
  /** The explicit typeahead text, or null to read the item's text when a key is pressed. */
  readonly label: Signal<string | null>;
  /**
   * A checkable item's Enter, which Content handles on keydown, so the button's native click never
   * runs for it; null for an item whose Enter clicks natively.
   */
  readonly enter: (() => void) | null;
}

/** Menu items have no value: they are never preferred and nothing reads their navigations. */
const noValue = signal("").asReadonly();
const focusable = signal(true).asReadonly();

/**
 * Every menu's Content and item elements: an event's origin is the first of them on its composed
 * path, so an item inside a nested menu is never mistaken for an item of the menu around it.
 */
const menuElements = new WeakSet<EventTarget>();

/** A key that types a character: one code point, such as a letter, digit or symbol. */
function printable(key: string): boolean {
  return key !== " " && /^.$/su.test(key);
}

/**
 * @internal One menu's private item scope, provided by its Content: the roving focus its items
 * register with (provided beside it, so a Trigger inside a Toolbar stays in the Toolbar's), the
 * typeahead buffer, the pending entry's fulfilment and the one activation path every item uses.
 * A submenu's Content provides its own.
 */
@Service({ autoProvided: false })
export class MenuContentContext {
  readonly #menu = inject(MenuContext);
  readonly #roving = inject(ɵOrigamiRovingFocusContext, { self: true });
  readonly #document = inject(DOCUMENT);
  readonly #typeahead = new ɵTypeaheadBuffer();
  /** The registered items by element, so keys from a nested menu's items are told apart. */
  readonly #items = new Map<HTMLElement, MenuItemRegistration>();
  #element: HTMLElement | null = null;
  #destroyed = false;
  /**
   * The Space press that joined a search is still held in the menu: its keyup must not click the
   * item it lands on.
   */
  #space = false;
  /** The pointer's last position over this menu's items, null until it first moves over one. */
  #pointer: { readonly x: number; readonly y: number } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });

    // A search doesn't survive a close, nor does the press that joined it.
    effect(() => {
      if (!this.#menu.open()) {
        this.#space = false;
        untracked(() => this.#typeahead.reset());
      }
    });
  }

  /** Content's host element, which holds focus while there's no item; set by Content at construction. */
  attach(element: HTMLElement): void {
    this.#element = element;
    menuElements.add(element);
  }

  /** Registers an item from its `ngOnInit` with the roving focus; `destroyRef` removes it. */
  register(item: MenuItemRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#items.set(item.element, item);
    menuElements.add(item.element);
    destroyRef.onDestroy(() => {
      this.#items.delete(item.element);
      menuElements.delete(item.element);
    });
    this.#roving.register(
      {
        element: item.element,
        value: noValue,
        disabled: item.disabled,
        focusable,
        label: () => {
          const label = item.label();

          if (label !== null) {
            return label;
          }

          return (item.element.textContent ?? "").replace(/\s+/g, " ").trim();
        },
      },
      destroyRef,
    );
  }

  /**
   * Fulfils the pending entry after the menu is revealed: focuses its edge item, or Content while
   * no item takes focus, which keeps the entry pending for items that register later. The root
   * has already cancelled an entry the user moved focus away from. Reads membership, so a
   * reactive caller runs again when items register.
   */
  fulfil(entry: MenuEntry): void {
    const element = this.#element;

    if (element === null) {
      return;
    }

    // Seen in capture, before the item's own focus handlers, which may move focus on at once.
    let reached = false;
    const reach = (event: FocusEvent): void => {
      const [target] = event.composedPath();

      if (target instanceof HTMLElement && this.#items.has(target)) {
        reached = true;
      }
    };

    element.addEventListener("focus", reach, true);

    let focused: boolean;

    try {
      focused = this.#roving.focusEdge(entry.edge) || reached;
    } finally {
      element.removeEventListener("focus", reach, true);
    }

    // The item's focus handlers ran inside: one may have destroyed this menu, or moved focus
    // elsewhere, which cancelled the entry.
    if (this.#destroyed || untracked(this.#menu.entry) !== entry) {
      return;
    }

    // Where an item's focus handlers moved focus from there is the consumer's.
    if (focused) {
      this.#menu.settle(entry);

      return;
    }

    // No item yet, or one that refuses focus, such as a hidden one.
    if (this.#document.activeElement !== element) {
      element.focus();
    }
  }

  /**
   * An item's `focus`: it becomes the roving focus's focused member. The item's own event, not
   * Content's `focusin`, which a move within a shadow root inside Content never reaches.
   */
  focused(element: HTMLElement): void {
    this.#roving.focus(element);
  }

  /** An item's `blur`. */
  blurred(element: HTMLElement): void {
    this.#roving.blur(element);
  }

  /**
   * Content's `keydown`, from Content itself or one of its items, also one inside an open shadow
   * root within Content, which the event's target only names by its shadow host; keys from a
   * nested menu's items are that menu's. Tab and Shift+Tab focus the Trigger and close, without
   * preventing the native move; arrows, Home and End move focus (the roving focus); Enter on an
   * enabled checkable item activates it; a character searches.
   */
  keydown(event: KeyboardEvent): void {
    // Every Space press decides for itself: one that doesn't join a search clicks natively.
    if (event.key === " ") {
      this.#space = false;
    }

    const target = this.#origin(event);

    if (this.#destroyed || target === null) {
      return;
    }

    const self = target === this.#element;

    this.#menu.keyed();

    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const key = event.key;

    if (key === "Tab") {
      this.#menu.exit();

      return;
    }

    if (self) {
      this.#fromContent(event);
    } else {
      this.#roving.keydown(target, event);
    }

    if (event.defaultPrevented) {
      return;
    }

    // A checkable item's Enter closes the menu; its native click, which would stay open, is
    // prevented. A disabled one's still clicks, for the consumer's own listeners.
    if (key === "Enter" && !self) {
      const item = this.#items.get(target);

      if (item !== undefined && item.enter !== null && !item.disabled()) {
        event.preventDefault();
        item.enter();
      }

      return;
    }

    if (key === " " && this.#typeahead.running(event.timeStamp)) {
      event.preventDefault();
      this.#space = true;
      this.#search(key, event.timeStamp, target);

      return;
    }

    if (printable(key)) {
      event.preventDefault();
      this.#search(key, event.timeStamp, target);

      return;
    }

    // Space activates a link as Enter does; a button item activates by its own native click.
    if (key === " " && !self && target instanceof HTMLAnchorElement) {
      event.preventDefault();
      target.click();
    }
  }

  /** Content's `keyup`: a Space that joined a search must not click the item. */
  keyup(event: KeyboardEvent): void {
    if (event.key === " " && this.#space) {
      this.#space = false;
      event.preventDefault();
    }
  }

  /**
   * Content's `focusout`: focus leaving Content's flat tree, as on Escape, which focuses the
   * Trigger, takes a search's held Space with it, whose keyup then lands elsewhere. A move between
   * items keeps it.
   */
  left(event: FocusEvent): void {
    const next = event.relatedTarget;
    const element = this.#element;

    if (next instanceof Node && element !== null && ɵflatTreeContains(element, next)) {
      return;
    }

    this.#space = false;
  }

  /**
   * An item's `pointermove`: a mouse moving over it focuses it. Never touch or pen. While the
   * keyboard was used last, an event at the pointer's last position over the items isn't
   * movement, so items scrolling under a still cursor don't take focus; before the pointer has
   * moved over an item, nothing is known, and the event counts as movement.
   */
  hovered(element: HTMLElement, event: PointerEvent): void {
    if (this.#destroyed || event.pointerType !== "mouse") {
      return;
    }

    const last = this.#pointer;

    this.#pointer = { x: event.clientX, y: event.clientY };

    if (this.#menu.keyboard()) {
      const still = last !== null && last.x === event.clientX && last.y === event.clientY;

      if (still) {
        return;
      }

      this.#menu.pointed();
    }

    if (this.#document.activeElement !== element) {
      element.focus();
    }
  }

  /**
   * The one activation path: focuses the Trigger, closes the menu, then runs `emit`; with `close`
   * false, only runs `emit`. Callers check their own disabled state first.
   */
  activate(emit: () => void, close: boolean): void {
    if (!this.#destroyed) {
      this.#menu.select(emit, close);
    }
  }

  /**
   * Content itself when it's the event's own target, else the first menu element on the event's
   * composed path if it's one of this menu's items; null for anything else.
   */
  #origin(event: Event): HTMLElement | null {
    const path = event.composedPath();

    if (path[0] === this.#element) {
      return this.#element;
    }

    for (const node of path) {
      if (menuElements.has(node)) {
        return node instanceof HTMLElement && this.#items.has(node) ? node : null;
      }
    }

    return null;
  }

  /** Arrows, Home and End while Content itself holds focus enter at an edge. */
  #fromContent(event: KeyboardEvent): void {
    const key = event.key;

    if (key === "ArrowDown" || key === "Home") {
      event.preventDefault();
      this.#roving.focusEdge("first");
    } else if (key === "ArrowUp" || key === "End") {
      event.preventDefault();
      this.#roving.focusEdge("last");
    }
  }

  #search(character: string, time: number, target: HTMLElement): void {
    const search = this.#typeahead.add(character, time);
    const match = this.#roving.search(search, target);

    if (match !== null && match !== this.#document.activeElement) {
      match.focus();
    }
  }
}
