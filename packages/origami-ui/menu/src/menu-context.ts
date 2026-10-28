import {
  DOCUMENT,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Service,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { ɵdocumentOrder } from "@loozo/origami-ui/collection";
import { injectDeferred, ɵOrigamiLayer, ɵflatTreeContains } from "@loozo/origami-ui/utils";

/** Where opening puts focus: the first or the last item. */
export type MenuEdge = "first" | "last";

/** One effective `open` decision: a new object every time a write changes the requested state. */
export type MenuIntent = { readonly open: boolean };

/**
 * A pending request to focus an edge item once the menu is revealed, a new object every time,
 * bound to the open decision it was made under.
 */
export type MenuEntry = { readonly edge: MenuEdge; readonly intent: MenuIntent };

/** A user's opening while its `open` write runs: a focus move elsewhere during the write cancels it. */
type Opening = { cancelled: boolean };

/** A Sub's open decision and the parent's open decision it holds under. */
type Bound = { readonly intent: MenuIntent; readonly under: MenuIntent };

/** What the Trigger registers from its `ngOnInit`; `id` reads its effective Options. */
export interface MenuTriggerRegistration {
  readonly element: HTMLElement;
  readonly id: Signal<string>;
}

/** What Content registers from its `ngOnInit`. */
export interface MenuContentRegistration {
  /** Its host element: focus inside it keeps a pending entry. */
  readonly element: HTMLElement;
  /** Its composed Popover's native participation. */
  readonly participating: Signal<boolean>;
}

/** The root's Options as the Context reads them; the root supplies them from its own Options token. */
export abstract class MenuRootOptions {
  /** Requested open state, which the composed Popover root also reads and writes. */
  abstract readonly open: WritableSignal<boolean>;
  /** Blocks opening from the Trigger; becoming true closes an open menu. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Provides the root Options beside the Context.
   * @param factory - Runs in the root's injection context the first time the Context reads it.
   * @returns A local provider.
   */
  static provideFactory(factory: () => MenuRootOptions): Provider {
    return { provide: MenuRootOptions, useFactory: factory };
  }
}

/** A Sub's parent menu's Context, provided beside the Sub's own; a root Menu has none. */
export const MenuParent = new InjectionToken<MenuContext>("MenuParent");

/**
 * @internal The private owner of a Menu root or of a Sub, a nested root: the registered Trigger
 * (a Sub's is its sub-trigger) and Content, the pending entry and the input modality that hover
 * reads; it closes a menu that becomes disabled. Its `select` is the one order every activation
 * closes in: focus the root's Trigger, close the whole tree, then emit. A Sub's Context knows its
 * parent's and closes when it does; a parent keeps at most one Sub open.
 */
@Service({ autoProvided: false })
export class MenuContext {
  /** The parent menu's Context for a Sub, null for a root Menu. */
  readonly parent: MenuContext | null = inject(MenuParent, { self: true, optional: true });
  readonly #root = injectDeferred(MenuRootOptions);
  /** The composed Popover's layer, which closes this menu's tree. */
  readonly #layer = inject(ɵOrigamiLayer, { self: true });
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
  /** The root's or Sub's host, whose document order breaks a tie between Subs opened in one turn. */
  readonly #host = inject<ElementRef<Element>>(ElementRef).nativeElement;
  /** The Subs whose parent this menu is. */
  readonly #subs = new Set<MenuContext>();
  readonly #trigger = signal<MenuTriggerRegistration | null>(null);
  readonly #content = signal<MenuContentRegistration | null>(null);
  /** The last request; `entry` tells whether it's still pending. */
  readonly #requested = signal<MenuEntry | null>(null);
  #destroyed = false;
  /** Whether the keyboard was used since the pointer last moved; hover then doesn't move focus. */
  #keyboard = false;
  /** A `focusin`, read at the focused element itself, not the shadow host the document sees. */
  readonly #focusMoved = (event: Event): void => {
    const [target = null] = event.composedPath();

    this.#moved(target);
  };
  /** The shadow roots `#focusMoved` listens on besides the document. */
  readonly #roots = new Set<ShadowRoot>();
  /** The openings whose `open` write is running, nested if a listener opens again. */
  readonly #openings = new Set<Opening>();
  /**
   * A Sub's open decision once it's bound to its parent's: by a user's opening, to the one in force
   * before its write, else by the Sub's effect, to the one in force when the effect first sees it.
   */
  #bound: Bound | null = null;

  // Recomputed for every write that changes the effective `open`, so a close and a reopen
  // written before effects run still make a new decision, which the pending entry no longer belongs to, as Popover's
  // intent does.
  readonly #intent: Signal<MenuIntent> = computed(
    (): MenuIntent => ({ open: this.#root().open() }),
  );

  /** Requested open state. */
  readonly open = computed(() => this.#intent().open);
  /**
   * The effective `open` as the composed Popover reads and writes it. Its writes, the Trigger's
   * click opening and the dismissals, go through the Context: an opening is the same as the
   * Trigger's keys'.
   */
  readonly popoverOpen: WritableSignal<boolean> = linkedSignal(() => this.#root().open(), {
    // Every change reaches Popover, also a close and a reopen before it reads, as reading the
    // effective `open` itself does: its intent is a new decision for each.
    equal: () => false,
    set: (open) => {
      if (!open) {
        this.#root().open.set(false);
      } else if (this.parent === null) {
        this.#open("first");
      } else {
        // A click on a sub-trigger leaves focus on it.
        this.#open(null);
      }
    },
  });
  readonly disabled = computed(() => this.#root().disabled());
  /** The registered Content's native participation; false without Content. */
  readonly participating = computed(() => this.#content()?.participating() ?? false);
  /** The registered Trigger's effective ID, null until it registers: Content's `aria-labelledby`. */
  readonly triggerId = computed(() => this.#trigger()?.id() ?? null);
  /**
   * The pending entry: the last request while the open decision it was made under holds and it
   * isn't settled or cancelled; null otherwise.
   */
  readonly entry = computed(() => {
    const entry = this.#requested();

    if (entry === null || entry.intent !== this.#intent()) {
      return null;
    }

    return entry;
  });

  constructor() {
    // Focus arriving anywhere but the Trigger or the menu cancels the pending entry. Focus falling
    // to nothing, as when the focused Trigger is removed, fires no `focusin`.
    this.#document.addEventListener("focusin", this.#focusMoved, true);
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
      this.#document.removeEventListener("focusin", this.#focusMoved, true);

      for (const root of this.#roots) {
        root.removeEventListener("focusin", this.#focusMoved, true);
      }
    });

    const parent = this.parent;

    if (parent !== null) {
      // A Sub's open decision holds while the parent's open decision it's bound to does: the
      // parent's close since, also one undone by a reopen before effects run, closes it with its own
      // Subs, so a reopened menu starts with every submenu closed, and an open write while the parent
      // is closed doesn't hold either. A decision first seen here is bound to the parent's decision
      // now, so `open` writes made before effects run settle by their final values, and it's
      // admitted among its siblings.
      effect(() => {
        const intent = this.#intent();
        const current = parent.#intent();

        if (!intent.open) {
          return;
        }

        untracked(() => {
          const previous = this.#bound;
          const bound =
            previous !== null && previous.intent === intent ? previous : { intent, under: current };

          this.#bound = bound;

          if (!current.open || bound.under !== current) {
            this.close();
          } else if (bound !== previous) {
            parent.#admit(this);
          }
        });
      });
    }

    // Disabling an open menu closes it, as Select does; an open write while disabled stays
    // authoritative. The Trigger closes it for its own disabled.
    let wasDisabled: boolean | null = null;

    effect(() => {
      const disabled = this.disabled();

      if (wasDisabled === false && disabled) {
        untracked(() => this.close());
      }

      wasDisabled = disabled;
    });
  }

  /** Registers the Trigger from its `ngOnInit`; its composed Popover Trigger rejects a second one first. */
  registerTrigger(trigger: MenuTriggerRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#trigger.set(trigger);
    destroyRef.onDestroy(() => {
      if (this.#trigger() === trigger) {
        this.#trigger.set(null);
      }
    });
  }

  /** Registers a Sub with its parent menu from the Sub's `ngOnInit`; `destroyRef` removes it. */
  registerSub(destroyRef: DestroyRef): void {
    const parent = this.parent;

    if (parent === null || destroyRef.destroyed) {
      return;
    }

    parent.#subs.add(this);
    destroyRef.onDestroy(() => parent.#subs.delete(this));
  }

  /** Registers Content from its `ngOnInit`; its composed Popover Content rejects a second one first. */
  registerContent(content: MenuContentRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#content.set(content);
    destroyRef.onDestroy(() => {
      if (this.#content() === content) {
        this.#content.set(null);
      }
    });
  }

  /**
   * A user's request from the Trigger's keys, which has applied its own disabled policy: opens
   * the menu if it's closed and makes `edge` the pending entry under the resulting open decision,
   * replacing any other.
   */
  enter(edge: MenuEdge): void {
    this.#open(edge);
  }

  /** A Sub's opening by the mouse resting on its sub-trigger, which keeps focus. */
  hover(): void {
    this.#open(null);
  }

  /**
   * Every user opening, from the Trigger's keys and its click through Popover: closes a Sub's open
   * siblings, writes `open` true, binds a Sub's resulting decision to its parent's decision in force
   * before the write, then binds the request for `edge`, if any, to the open decision in force when
   * that write returns. The write runs `openChange` listeners synchronously, before the
   * request exists. One that moves focus elsewhere or destroys the menu ends the opening there: no
   * request and no focus move. One that closes the menu leaves nothing to request; one that closes
   * and reopens it keeps the opening, whose request then belongs to the reopened menu. A sibling
   * whose `openChange` listener reopens it while it closes is the newest decision: the opening ends
   * before its write.
   */
  #open(edge: MenuEdge | null): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    if (this.parent !== null && !this.parent.closeSubs(this)) {
      return;
    }

    if (this.#destroyed) {
      return;
    }

    const under = this.parent === null ? null : untracked(this.parent.#intent);
    const root = this.#root();
    const trigger = this.#trigger();

    if (trigger !== null) {
      this.#hold(trigger.element);
    }

    const opening: Opening = { cancelled: false };

    this.#openings.add(opening);

    try {
      root.open.set(true);
    } finally {
      this.#openings.delete(opening);
    }

    if (this.#destroyed) {
      return;
    }

    const intent = this.#intent();

    // A Sub holds under its parent's decision before the write: a listener's close of the parent
    // during it resets the Sub.
    if (under !== null && intent.open) {
      this.#bound = { intent, under };
    }

    // A listener may also have closed it.
    if (opening.cancelled || !intent.open || edge === null) {
      return;
    }

    this.#requested.set({ edge, intent });

    // A clicked Trigger the engine didn't focus (macOS Safari) leaves focus on the body. Its focus
    // handlers run after the request exists, which a move elsewhere then cancels.
    const focused = this.#document.activeElement;

    if (focused === null || focused === this.#document.body) {
      this.#trigger()?.element.focus();
    }
  }

  /**
   * Watches focus moves away from the Trigger `element` and the Content in its tree, where a
   * pending entry's focus is, also within the shadow roots they're in: a `focusin` between two
   * elements of one shadow root doesn't reach the document.
   */
  #hold(element: HTMLElement): void {
    for (
      let root = element.getRootNode();
      root instanceof ShadowRoot;
      root = root.host.getRootNode()
    ) {
      if (!this.#roots.has(root)) {
        this.#roots.add(root);
        root.addEventListener("focusin", this.#focusMoved, true);
      }
    }
  }

  /** Ends `entry` once it's fulfilled or abandoned, if it's still the pending one. */
  settle(entry: MenuEntry): void {
    if (untracked(this.entry) === entry) {
      this.#requested.set(null);
    }
  }

  /**
   * An activation in this menu: focuses the root Menu's Trigger, closes the whole tree, then runs
   * `emit`. A Dialog the listener opens records the Trigger as the element to return focus to, and
   * whatever the listener focuses wins. A Trigger that can't take focus, such as one that's gone or
   * detached, doesn't stop it: the tree closes and `emit` runs with focus wherever it was. With
   * `close` false, as for a checkable item's Space or click, only `emit` runs: the tree stays open
   * and focus where it is.
   */
  select(emit: () => void, close: boolean): void {
    if (this.#destroyed) {
      return;
    }

    if (!close) {
      emit();

      return;
    }

    const root = this.#outermost();

    root.#closeTree();

    // Focus handlers run inside focus() and `openChange` listeners inside the writes: once one has
    // destroyed the menu, its `open` may be a replacement's, so nothing was written and nothing is
    // emitted.
    if (!this.#destroyed && !root.#destroyed) {
      emit();
    }
  }

  /**
   * Tab or Shift+Tab from inside the menu or a submenu: focuses the root Menu's Trigger and closes
   * the whole tree, so the key's native move continues from the Trigger's place in the page.
   */
  exit(): void {
    if (!this.#destroyed) {
      this.#outermost().#closeTree();
    }
  }

  /** A Sub's back arrow: focuses its sub-trigger and closes it with its own submenus. */
  back(): void {
    if (!this.#destroyed) {
      this.#closeTree();
    }
  }

  /**
   * Closes this menu's open Subs other than `keep`, with their own: one Sub is open per menu.
   * False once an `openChange` listener kept or reopened one, or destroyed this menu.
   */
  closeSubs(keep: MenuContext | null): boolean {
    for (const sub of this.#subs) {
      if (sub !== keep && untracked(sub.open)) {
        sub.close();

        if (this.#destroyed) {
          return false;
        }
      }
    }

    for (const sub of this.#subs) {
      if (sub !== keep && untracked(sub.open)) {
        return false;
      }
    }

    return true;
  }

  /**
   * A new open decision of `sub`, one of this menu's Subs, first seen by its effect: it closes the
   * other open Subs, the newest decision winning, unless one opened in the same turn, its decision
   * not bound yet, precedes it in document order, which holds instead. Effects run in creation
   * order per view, which isn't document order across views, so the order is read here.
   */
  #admit(sub: MenuContext): void {
    for (const sibling of this.#subs) {
      if (
        sibling !== sub &&
        untracked(sibling.open) &&
        sibling.#bound?.intent !== untracked(sibling.#intent) &&
        ɵdocumentOrder(sibling.#host, sub.#host) < 0
      ) {
        sub.close();

        return;
      }
    }

    this.closeSubs(sub);
  }

  /** The open Sub of this menu, if any. */
  openSub(): MenuContext | null {
    for (const sub of this.#subs) {
      if (untracked(sub.open)) {
        return sub;
      }
    }

    return null;
  }

  /** The registered Content's element, null without Content. */
  contentElement(): HTMLElement | null {
    return untracked(this.#content)?.element ?? null;
  }

  /**
   * Focuses this menu's Trigger, then closes it and its open Subs, descendants first, through the
   * composed Popover's layer, which stops once a listener changed the tree.
   */
  #closeTree(): void {
    if (!this.#destroyed) {
      this.#layer.closeBranch(() => this.#trigger()?.element.focus());
    }
  }

  /** The root Menu: this one for a root, else its parent's. */
  #outermost(): MenuContext {
    if (this.parent === null) {
      return this;
    }

    return this.parent.#outermost();
  }

  /**
   * Closes without activating, as Escape on the Trigger before the menu participates, a disabling
   * and a sibling Sub's opening do: writes its open Subs' `open` false, innermost first, then its
   * own, so a menu reopened at once still shows them closed.
   */
  close(): void {
    if (this.#destroyed) {
      return;
    }

    this.closeSubs(null);

    // A Sub's `openChange` listener may have destroyed this menu, whose `open` may then be a
    // replacement's: it writes nothing.
    if (!this.#destroyed) {
      this.#root().open.set(false);
    }
  }

  /** A key was pressed on the Trigger or inside the menu. */
  keyed(): void {
    this.#keyboard = true;
  }

  /** The pointer moved for real, or was pressed: hover may move focus again. */
  pointed(): void {
    this.#keyboard = false;
  }

  /** Whether the keyboard was used since the pointer last moved. */
  keyboard(): boolean {
    return this.#keyboard;
  }

  /**
   * Focus moved to `target`: anywhere but the Trigger, Content or inside it in the flat tree
   * cancels the pending entry, or the one being requested, for good, even if focus comes back
   * before it would be fulfilled.
   */
  #moved(target: EventTarget | null): void {
    if (this.#openings.size === 0 && untracked(this.entry) === null) {
      return;
    }

    const trigger = untracked(this.#trigger);
    const content = untracked(this.#content);
    const held =
      target instanceof Node &&
      (target === trigger?.element ||
        (content !== null && ɵflatTreeContains(content.element, target)));

    if (!held) {
      this.#requested.set(null);

      for (const opening of this.#openings) {
        opening.cancelled = true;
      }
    }
  }
}
