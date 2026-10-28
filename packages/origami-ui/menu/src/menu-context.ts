import {
  DOCUMENT,
  DestroyRef,
  Service,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { injectDeferred, ɵflatTreeContains } from "@loozo/origami-ui/utils";

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

/**
 * @internal The Menu root's private owner: the registered Trigger and Content, the pending entry
 * and the input modality that hover reads; it closes a menu that becomes disabled. Its `select` is
 * the one order every activation closes in: focus the Trigger, close, then emit.
 */
@Service({ autoProvided: false })
export class MenuContext {
  readonly #root = injectDeferred(MenuRootOptions);
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
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

  // Recomputed for every write that changes the effective `open`, so a close and a reopen
  // written before effects run still make a new decision, which the pending entry no longer belongs to, as Popover's
  // intent does.
  readonly #intent = computed<MenuIntent>(() => ({ open: this.#root().open() }));

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
      if (open) {
        this.#open("first");
      } else {
        this.#root().open.set(false);
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

    // Disabling an open menu closes it, as Select does; an open write while disabled stays
    // authoritative. The Trigger closes it for its own disabled.
    let wasDisabled: boolean | null = null;

    effect(() => {
      const disabled = this.disabled();

      if (wasDisabled === false && disabled) {
        untracked(() => this.#root().open.set(false));
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

  /**
   * Every user opening, from the Trigger's keys and its click through Popover: writes `open` true,
   * then binds the request for `edge` to the open decision in force when that write returns. The
   * write runs `openChange` listeners synchronously, before the request exists. One that moves focus
   * elsewhere or destroys the menu ends the opening there: no request and no focus move. One that
   * closes the menu leaves nothing to request; one that closes and reopens it keeps the opening,
   * whose request then belongs to the reopened menu.
   */
  #open(edge: MenuEdge): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

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

    if (this.#destroyed || opening.cancelled) {
      return;
    }

    const intent = this.#intent();

    // A listener may also have closed it.
    if (!intent.open) {
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
   * An activation: focuses the Trigger, writes `open` false, then runs `emit`. A Dialog the
   * listener opens records the Trigger as the element to return focus to, and whatever the
   * listener focuses wins. A Trigger that can't take focus, such as one that's gone or detached,
   * doesn't stop it: the menu closes and `emit` runs with focus wherever it was. With `close`
   * false, as for a checkable item's Space or click, only `emit` runs: the menu stays open and
   * focus where it is.
   */
  select(emit: () => void, close: boolean): void {
    if (this.#destroyed) {
      return;
    }

    if (!close) {
      emit();

      return;
    }

    this.#trigger()?.element.focus();

    // Focus handlers run inside focus(): once one has destroyed this menu, its `open` may be a
    // replacement's, so nothing is written or emitted.
    if (this.#destroyed) {
      return;
    }

    this.#root().open.set(false);

    // So do `openChange` listeners inside the write.
    if (!this.#destroyed) {
      emit();
    }
  }

  /**
   * Tab or Shift+Tab from inside the menu: focuses the Trigger and closes, so the key's native
   * move continues from the Trigger's place in the page.
   */
  exit(): void {
    if (this.#destroyed) {
      return;
    }

    this.#trigger()?.element.focus();

    // As in `select`: a focus handler may have destroyed this menu.
    if (this.#destroyed) {
      return;
    }

    this.#root().open.set(false);
  }

  /** Closes without activating: Escape on the Trigger before the menu participates. */
  close(): void {
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
