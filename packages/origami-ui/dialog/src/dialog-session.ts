import {
  ChangeDetectorRef,
  DestroyRef,
  ElementRef,
  ErrorHandler,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { OrigamiPresenceState, ɵOrigamiPresencePresentation } from "@loozo/origami-ui/presence";
import {
  injectDeferred,
  ɵOrigamiLayer,
  ɵdeepActiveElement,
  ɵflatTreeContains,
} from "@loozo/origami-ui/utils";
import type {
  ɵOrigamiIntent,
  ɵOrigamiPresentation,
  ɵOrigamiPresentationChild,
} from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";
import { OrigamiDialogContentOptions } from "./dialog-content";
import { ModalSessions } from "./modal-sessions";
import type { ModalDialog, ModalReturn } from "./modal-sessions";

/** One `showModal()` until its native close; compared by identity. */
type Session = { readonly order: number };

/**
 * Focuses `element` and reports whether it took focus. Not predicted: a disconnected, disabled
 * or inert element, including one blocked by a modal dialog, simply doesn't take it.
 */
function focus(element: HTMLElement | SVGElement): boolean {
  element.focus();

  return element.matches(":focus");
}

/**
 * Whether `element` is focusable only because it's a scroll container that overflows, as Chromium
 * makes one. No `tabindex` attribute and the default `tabIndex` of -1 leave out controls, links,
 * `summary` and an author's own `tabindex`; `autofocus` makes it the consumer's choice. Reads go
 * through the prototypes: a form's controls shadow its members by name.
 */
function focusableOnlyAsScroller(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const tabIndex: number = Reflect.get(HTMLElement.prototype, "tabIndex", element);
  const editable: boolean = Reflect.get(HTMLElement.prototype, "isContentEditable", element);

  if (
    Element.prototype.hasAttribute.call(element, "tabindex") ||
    Element.prototype.hasAttribute.call(element, "autofocus") ||
    tabIndex !== -1 ||
    editable
  ) {
    return false;
  }

  const style = getComputedStyle(element);
  const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
  const scrollsY = style.overflowY === "auto" || style.overflowY === "scroll";

  return (
    (scrollsX &&
      Reflect.get(Element.prototype, "scrollWidth", element) >
        Reflect.get(Element.prototype, "clientWidth", element)) ||
    (scrollsY &&
      Reflect.get(Element.prototype, "scrollHeight", element) >
        Reflect.get(Element.prototype, "clientHeight", element))
  );
}

/**
 * @internal The native modal session of one Dialog Content `<dialog>`, provided on it. It calls
 * `showModal()` in the after-render WRITE phase once the root requests open, keeps the dialog
 * modal while Content's Presence runs the exit, then calls `close()` and returns focus. It is
 * the Content's dismissal layer owner, a modal scope: the presentation parent of the Popovers and
 * Tooltips whose parts its `<dialog>` contains, and the Dialog of the Dialog Contents it contains.
 */
@Service({ autoProvided: false })
export class DialogSession implements ɵOrigamiPresentation, ModalDialog {
  readonly #element = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  readonly #context = inject(DialogContext);
  readonly #options = injectDeferred(OrigamiDialogContentOptions);
  readonly #presence = inject(OrigamiPresenceState);
  readonly #presentation = inject(ɵOrigamiPresencePresentation);
  readonly #changeDetector = inject(ChangeDetectorRef);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #sessions = inject(ModalSessions);
  readonly #errorHandler = inject(ErrorHandler);
  // Replaced on every change, never mutated: a close suppresses the children it started with.
  readonly #children = signal<ReadonlySet<ɵOrigamiPresentationChild>>(new Set());
  readonly #ready = signal(false);
  #epoch = 0;
  #session: Session | null = null;
  #seenIntent: ɵOrigamiIntent | null = null;
  #destroyed = false;

  /** What Content registers with the root; only the registered Content opens. */
  readonly part = {
    options: this.#options,
    active: () => this.#session !== null,
    end: () => this.endNow(),
  };
  /** Escape order and outside-pointer dismissal; a Popover inside, its member, joins this branch. */
  readonly layer: ɵOrigamiLayer = new ɵOrigamiLayer({
    intent: this.#context.intent,
    revision: this.#context.policy,
    dismissible: this.#context.dismissible,
    parent: null,
    modal: this.#element,
    joinsModalBranch: false,
    presentation: this,
    containsTarget: (target, event) => this.#contains(target, event),
    containsFocus: (focus) => ɵflatTreeContains(this.#element, focus),
    elements: () => [this.#element],
    closeFromInteraction: () => {
      this.#context.setOpen(false);
      this.synchronize();
    },
    restoreFocus: () => {
      // Focus returns once the native session ends, not when the close is requested.
    },
  });

  constructor() {
    effect(() => {
      this.#context.intent();
      this.#presence.phase();
      untracked(() => {
        this.synchronize();

        // Before Content's host bindings, so an entrance is marked in the render that shows it.
        if (this.#context.desired()) {
          this.#presentation.permitEnter(this.#presentation.captureTransition());
        }

        this.#changeDetector.markForCheck();
      });
    });

    afterEveryRender({ write: () => this.#write() });

    this.#sessions.register(this);
    inject(DestroyRef).onDestroy(() => this.#destroy());
  }

  order(): number {
    return this.#session?.order ?? -1;
  }

  activation(): object | null {
    return this.#session;
  }

  epoch(): number {
    return this.#epoch;
  }

  ready(): boolean {
    return this.#ready();
  }

  /** Modal, from `showModal()` until the native close, including the whole exit. */
  isParticipating(): boolean {
    this.synchronize();

    return !this.#destroyed && this.#session !== null && this.#element.open;
  }

  requested(): boolean {
    return !this.#destroyed && this.#context.desired();
  }

  canPresent(): boolean {
    return this.requested();
  }

  retainingExit(): boolean {
    return (
      !this.#context.desired() && this.#session !== null && this.#presence.phase() === "closing"
    );
  }

  addChild(child: ɵOrigamiPresentationChild): void {
    this.#children.update((children) => new Set(children).add(child));
  }

  removeChild(child: ɵOrigamiPresentationChild): void {
    this.#children.update((children) => {
      const remaining = new Set(children);

      remaining.delete(child);

      return remaining;
    });
  }

  /**
   * On a newly observed close: no longer ready, and requested-open children are suppressed. A
   * child already closing keeps its exit while this one retains its own (`retainingExit`).
   */
  synchronize(): void {
    if (this.#destroyed) {
      return;
    }

    const intent = this.#context.intent();

    if (intent === this.#seenIntent) {
      return;
    }

    this.#seenIntent = intent;

    if (intent.open) {
      return;
    }

    this.#setReady(false);

    for (const child of this.#children()) {
      if (this.#destroyed || this.#context.intent() !== intent) {
        return;
      }

      if (child.desired()) {
        child.suppress();
      }
    }
  }

  /**
   * A native close request (`cancel`): the back gesture or `requestClose()`. A cancelable one is
   * prevented. On the topmost session it's handled exactly as Escape, so a Popover or Tooltip
   * inside closes first; on an older one, such as `requestClose()` under a newer dialog, it
   * dismisses this Dialog's own branch, as the platform closes the dialog it targets. A forced
   * one closes natively and the `close` event reconciles it.
   */
  cancel(event: Event): void {
    if (this.#destroyed || !event.cancelable) {
      return;
    }

    event.preventDefault();

    if (this.#session !== null && this.#sessions.isTopmost(this.#session)) {
      this.layer.dismissTopmost();
    } else {
      this.layer.dismiss("escape", false);
    }
  }

  /** A native `close` event. Origami's own close has already ended its session; a later one is stale. */
  nativeClose(): void {
    if (!this.#destroyed && this.#session !== null && !this.#element.open) {
      this.#closedNatively(this.#session);
    }
  }

  #write(): void {
    if (this.#destroyed || this.#server) {
      return;
    }

    this.synchronize();

    const session = this.#session;

    if (session !== null && !this.#element.open) {
      this.#closedNatively(session);

      return;
    }

    if (this.#context.desired()) {
      if (session === null) {
        this.#open();
      } else {
        // Reopened during the exit: the same session continues, and Presence reverses.
        this.#setReady(true);
        this.#reveal();
      }

      return;
    }

    if (session !== null && this.#presence.phase() === "closed") {
      this.#close(session);
    }
  }

  #open(): void {
    if (!this.#context.isContent(this.part) || !this.#element.isConnected) {
      return;
    }

    const session: Session = { order: this.layer.nextOrder() };

    // Participating before `showModal()`, whose synchronous autofocus can dispatch Escape.
    this.#session = session;
    this.#sessions.hold(session);

    try {
      this.#element.showModal();
    } catch (error) {
      if (this.#session === session) {
        this.#end(session);
      }

      throw error;
    }

    if (this.#session !== session) {
      return;
    }

    if (!this.#element.open) {
      // A `beforetoggle` listener canceled the show: nothing opened and focus didn't move.
      this.#end(session);
      this.#context.setOpen(false);

      return;
    }

    this.#focusPastScroller(session);

    // The scroller's or the move's focus listeners may have ended the session or requested close.
    if (this.#session !== session || !this.#context.desired()) {
      return;
    }

    this.#setReady(true);
    this.#reveal();

    for (const child of this.#children()) {
      child.parentRevealed();
    }
  }

  /**
   * Right after `showModal()`: Chromium's initial focus can land on an element inside that's
   * focusable only as an overflowing scroll container, where Firefox and WebKit pass over it. Then
   * the first element in the `<dialog>`, in tree order, that takes focus and isn't one gets it, as
   * there; with none, the browser's choice stands. The scroller has already had `focus`. The walk
   * stops once focus leaves the scroller, to a candidate or wherever a focus listener moved it, and
   * once the opening is canceled.
   */
  #focusPastScroller(session: Session): void {
    const document = this.#element.ownerDocument;
    // The focused element itself, also in a shadow root or slotted inside. The predicate first, so
    // an ordinary opening walks up nothing.
    const scroller = ɵdeepActiveElement(document);

    if (
      scroller === null ||
      scroller === this.#element ||
      !focusableOnlyAsScroller(scroller) ||
      !ɵflatTreeContains(this.#element, scroller)
    ) {
      return;
    }

    // Light DOM only: a shadow host is focused only through `delegatesFocus`, which keeps focus
    // already inside it, so the walk goes on past a host whose scroller has it.
    const walker = Document.prototype.createTreeWalker.call(
      document,
      this.#element,
      NodeFilter.SHOW_ELEMENT,
    );

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (
        !(node instanceof HTMLElement || node instanceof SVGElement) ||
        focusableOnlyAsScroller(node)
      ) {
        continue;
      }

      if (
        this.#session !== session ||
        !this.#context.desired() ||
        ɵdeepActiveElement(document) !== scroller
      ) {
        return;
      }

      // Through the prototype: a form's control named `focus` shadows the method.
      if (node instanceof HTMLElement) {
        HTMLElement.prototype.focus.call(node);
      } else {
        SVGElement.prototype.focus.call(node);
      }
    }
  }

  /**
   * The dialog is modal: Presence may discover the current entrance, and a later close runs its
   * exit. Without this, as after the session ends, a close settles without one.
   */
  #reveal(): void {
    const transition = this.#presentation.captureTransition();

    this.#presentation.permitEnter(transition);
    this.#presentation.commitReveal(transition);
  }

  /** The exit has finished: close natively, which restores focus, then apply the return target. */
  #close(session: Session): void {
    const returnFocus = this.#options().returnFocus();
    const ended = this.#end(session);

    this.#reportOpenNested();
    this.#element.close();
    this.#returnFocus(ended, returnFocus);
  }

  /**
   * A close Origami didn't start (`method="dialog"`, a direct `close()`, a forced cancel): no
   * exit. Presence settles closed in the next render without waiting for host animations, also
   * when an exit was already running.
   */
  #closedNatively(session: Session): void {
    const returnFocus = this.#options().returnFocus();
    const ended = this.#end(session);

    this.#reportOpenNested();
    this.#context.setOpen(false);
    this.synchronize();
    this.#changeDetector.markForCheck();
    this.#returnFocus(ended, returnFocus);
  }

  /**
   * Before its own native close, so a nested exit outlasting this one leaves no modal behind. Dialogs
   * opened from code inside its opened component end first, so neither return target is inert.
   * Returns its return record, for the focus return that follows the native close.
   */
  #end(session: Session): ModalReturn {
    this.#context.disposeOwnedMounts();
    this.#session = null;
    this.#setReady(false);

    const ended = this.#sessions.release(session);

    this.#presentation.reset();

    for (const nested of this.#sessions.nestedIn(this.layer)) {
      nested.endExit();
    }

    return ended;
  }

  /**
   * The enclosing Dialog's session ended while this one runs its exit: close natively now, and
   * Presence settles in the next render. Focus follows the enclosing Dialog's return.
   */
  endExit(): void {
    const session = this.#session;

    if (this.#destroyed || session === null || this.#context.desired()) {
      return;
    }

    this.#end(session);
    this.#reportOpenNested();
    this.#element.close();
    this.#changeDetector.markForCheck();
  }

  /**
   * Its opened component is about to be torn down without an exit, as when its opener's owner is
   * destroyed: the session ends now, while the `<dialog>` is still connected, so the native close
   * restores focus as after an exit.
   */
  endNow(): void {
    if (!this.#destroyed) {
      this.#endWithoutExit();
    }
  }

  /**
   * At this Dialog's native close, once nested exits have ended: a Dialog Content inside its
   * `<dialog>` still requested open stays modal but not rendered, blocking the page. Only
   * application code can cause it, since this one is inert under it. Checked here, not at the
   * close request: an inner one closed later in the same turn isn't reported, one opened during
   * this exit is.
   */
  #reportOpenNested(): void {
    for (const nested of this.#sessions.nestedIn(this.layer)) {
      if (nested.requested()) {
        this.#errorHandler.handleError(
          new Error(
            "Dialog closed while a Dialog inside its Content is still open. Close the inner Dialog before or together with the outer one.",
          ),
        );

        return;
      }
    }
  }

  /**
   * After the native close of the session `ended` is the record of. While a newer session still
   * blocks the page nothing moves, and the chain keeps `returnFocus`. Otherwise `returnFocus` if it
   * takes focus; else the browser's restore stands unless focus was lost: on the body, or still
   * inside the closed dialog. Inside it in the flat tree, so also in a shadow root inside it, or
   * slotted into it when it is in one. Then the first of the chain's targets that takes focus
   * (`ModalSessions.returnTargets`); last the Trigger.
   */
  #returnFocus(ended: ModalReturn, returnFocus: HTMLElement | null): void {
    const targets = this.#sessions.returnTargets(ended, returnFocus);

    if (targets === null) {
      return;
    }

    if (returnFocus !== null && focus(returnFocus)) {
      return;
    }

    const document = this.#element.ownerDocument;
    const active = ɵdeepActiveElement(document);

    if (active !== null && active !== document.body && !ɵflatTreeContains(this.#element, active)) {
      return;
    }

    for (const target of targets) {
      if (focus(target)) {
        return;
      }
    }

    const trigger = this.#context.trigger();

    if (trigger !== null && !trigger.options().disabled()) {
      trigger.element.focus();
    }
  }

  #setReady(value: boolean): void {
    if (value !== this.#ready()) {
      this.#epoch += 1;
      this.#ready.set(value);
    }
  }

  /**
   * Only the dialog the page is blocked by has an outside: its own backdrop, a hit on the
   * `<dialog>` element outside its border box. Everything else is inside, including a newer
   * modal stacked above it. An alert dialog has no outside: its backdrop never dismisses it.
   */
  #contains(target: Node, event: PointerEvent): boolean {
    if (this.#context.role === "alertdialog") {
      return true;
    }

    const session = this.#session;

    if (session !== null && !this.#sessions.isTopmost(session)) {
      return true;
    }

    if (target !== this.#element) {
      return this.#element.contains(target);
    }

    const box = this.#element.getBoundingClientRect();

    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    );
  }

  /**
   * Content removed while modal: the session ends without an exit, and focus is returned. Its
   * layer stays registered until then, so the nested exits it ends still find it as their scope.
   */
  #destroy(): void {
    this.#destroyed = true;
    this.#setReady(false);
    this.#sessions.unregister(this);

    this.#endWithoutExit();
    this.layer.destroy();
  }

  /** Ends an active session without an exit, then returns focus. */
  #endWithoutExit(): void {
    const session = this.#session;

    if (session === null) {
      return;
    }

    const returnFocus = this.#options().returnFocus();
    const ended = this.#end(session);

    // Still connected, so the native close restores focus; removal itself restores nothing.
    if (this.#element.isConnected && this.#element.open) {
      this.#element.close();
    }

    this.#returnFocus(ended, returnFocus);
  }
}
