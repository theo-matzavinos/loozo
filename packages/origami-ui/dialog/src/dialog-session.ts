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
import { injectDeferred, ɵOrigamiLayer, ɵflatTreeContains } from "@loozo/origami-ui/utils";
import type {
  ɵOrigamiIntent,
  ɵOrigamiPresentation,
  ɵOrigamiPresentationChild,
} from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";
import { OrigamiDialogContentOptions } from "./dialog-content";
import { ModalSessions } from "./modal-sessions";
import type { ModalDialog } from "./modal-sessions";

/** One `showModal()` until its native close; compared by identity. */
type Session = { readonly order: number };

/**
 * Focuses `element` and reports whether it took focus. Not predicted: a disconnected, disabled
 * or inert element, including one blocked by another modal dialog, simply doesn't take it.
 */
function focus(element: HTMLElement): boolean {
  element.focus();

  return element.matches(":focus");
}

/** The focused element itself, inside any open shadow roots, where `activeElement` is their host. */
function deepActiveElement(document: Document): Element | null {
  let active = document.activeElement;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active;
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
  readonly part = { options: this.#options };
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
    containsFocus: (focus) => this.#element.contains(focus),
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

    if (!this.#context.desired()) {
      return;
    }

    this.#setReady(true);
    this.#reveal();

    for (const child of this.#children()) {
      child.parentRevealed();
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

    this.#end(session);
    this.#reportOpenNested();
    this.#element.close();
    this.#returnFocus(returnFocus);
  }

  /**
   * A close Origami didn't start (`method="dialog"`, a direct `close()`, a forced cancel): no
   * exit. Presence settles closed in the next render without waiting for host animations, also
   * when an exit was already running.
   */
  #closedNatively(session: Session): void {
    const returnFocus = this.#options().returnFocus();

    this.#end(session);
    this.#reportOpenNested();
    this.#context.setOpen(false);
    this.synchronize();
    this.#changeDetector.markForCheck();
    this.#returnFocus(returnFocus);
  }

  /** Before its own native close, so a nested exit outlasting this one leaves no modal behind. */
  #end(session: Session): void {
    this.#session = null;
    this.#setReady(false);
    this.#sessions.release(session);
    this.#presentation.reset();

    for (const nested of this.#sessions.nestedIn(this.layer)) {
      nested.endExit();
    }
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
   * `returnFocus` if it takes focus; otherwise the browser's restore stands, and the Trigger gets
   * focus only if it was lost: on the body, or still inside the closed dialog when the browser had
   * nothing to restore. Inside it in the flat tree, so also in a shadow root inside it, or slotted
   * into it when it is in one.
   */
  #returnFocus(target: HTMLElement | null): void {
    if (target !== null && focus(target)) {
      return;
    }

    const document = this.#element.ownerDocument;
    const active = deepActiveElement(document);

    if (active !== null && active !== document.body && !ɵflatTreeContains(this.#element, active)) {
      return;
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

    const session = this.#session;

    if (session !== null) {
      const returnFocus = this.#options().returnFocus();

      this.#end(session);

      // Still connected, so the native close restores focus; removal itself restores nothing.
      if (this.#element.isConnected && this.#element.open) {
        this.#element.close();
      }

      this.#returnFocus(returnFocus);
    }

    this.layer.destroy();
  }
}
