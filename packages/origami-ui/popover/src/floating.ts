import {
  ChangeDetectorRef,
  ErrorHandler,
  PLATFORM_ID,
  afterEveryRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { autoUpdate } from "@floating-ui/dom";
import type {
  OrigamiPresenceState,
  ɵOrigamiPresencePresentation,
  ɵOrigamiPresenceTransition,
} from "@loozo/origami-ui/presence";
import { injectUniqueValue } from "@loozo/origami-ui/utils";
import type {
  ɵOrigamiIntent,
  ɵOrigamiPresentation,
  ɵOrigamiPresentationChild,
} from "@loozo/origami-ui/utils";
import { positionContent } from "./floating-position";
import type { PositionAxes, PositionConfiguration } from "./floating-position";
import { FloatingPreparation } from "./floating-preparation";

/** @internal What a Content part registers: its element, placement Options, Presence and adapter. */
export type ɵOrigamiFloatingContent = {
  readonly element: HTMLElement;
  readonly options: () => {
    readonly id: Signal<string>;
    readonly side: Signal<PositionConfiguration["side"]>;
    readonly align: Signal<PositionConfiguration["align"]>;
    readonly gap: Signal<number>;
  };
  readonly presence: OrigamiPresenceState;
  readonly presentation: ɵOrigamiPresencePresentation;
};

/** @internal The registered parts a floating presentation needs, compared by identity. */
export type ɵOrigamiFloatingParts = {
  /** Positioning reference: Popover's Anchor, Tooltip's Trigger. */
  readonly reference: HTMLElement | null;
  readonly content: ɵOrigamiFloatingContent | null;
  /** Every part the owner requires is registered (Popover also requires its Trigger). */
  readonly complete: boolean;
};

/** @internal What an owner supplies. Signals are read lazily, after construction. */
export interface ɵOrigamiFloatingHost {
  /** Names the primitive and its reference in errors: "Popover" and "Anchor", "Tooltip" and "Trigger". */
  readonly label: string;
  readonly referenceLabel: string;
  readonly intent: Signal<ɵOrigamiIntent>;
  /** A new object exactly when a part changes; an activation belongs to the parts it started with. */
  readonly parts: Signal<ɵOrigamiFloatingParts>;
  /**
   * Resolves the presentation parent: it presents only after the parent reveals, and is suppressed
   * while the parent can't present. Called each time the presentation synchronizes (effects, after
   * render, events), never during render; the result stands until the next synchronization.
   */
  parent(): ɵOrigamiPresentation | null;
  /** Allocates the stacking order at a successful native activation. */
  nextOrder(): number;
  /**
   * Called once when synchronization observes a changed intent that is closed, after participation
   * and readiness are withdrawn and before presentation children are suppressed. `interaction`
   * says the close came from `closeFromInteraction`. Runs on both platforms.
   */
  closed(previous: ɵOrigamiIntent | null, interaction: boolean): void;
}

type Attempt = {
  readonly intent: ɵOrigamiIntent;
  readonly parts: ɵOrigamiFloatingParts;
  readonly configuration: PositionConfiguration;
  readonly parentRevision: number;
};
type Activation = {
  readonly parts: ɵOrigamiFloatingParts;
  readonly reference: HTMLElement;
  readonly content: ɵOrigamiFloatingContent;
  order: number;
  revealed: boolean;
};
type PositionSnapshot = {
  readonly activation: Activation;
  readonly intent: ɵOrigamiIntent;
  readonly configuration: PositionConfiguration;
  readonly request: number;
  readonly transition: ɵOrigamiPresenceTransition;
};
type PositionResult = PositionSnapshot & { readonly x: number; readonly y: number };

/**
 * @internal Native manual top-layer presentation of one Content host, positioned against its
 * owner's reference. An owner constructs it in its injection context and calls `destroy()` from
 * its own teardown.
 */
export class ɵOrigamiFloating implements ɵOrigamiPresentation, ɵOrigamiPresentationChild {
  readonly #host: ɵOrigamiFloatingHost;
  // The parent last resolved, whose child this is. Render reads only this, never the resolver.
  readonly #parent = signal<ɵOrigamiPresentation | null>(null);
  readonly #changeDetector = inject(ChangeDetectorRef);
  readonly #errorHandler = inject(ErrorHandler);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #preparation: FloatingPreparation;
  // Replaced on every change, never mutated: a close suppresses the children it started with.
  readonly #children = signal<ReadonlySet<ɵOrigamiPresentationChild>>(new Set());
  readonly #participating = signal(false);
  readonly #ready = signal(false);
  readonly #pulse = signal(0);
  #destroyed = false;
  #presentationEpoch = 0;
  #seenIntent: ɵOrigamiIntent | null = null;
  #seenConfiguration: PositionConfiguration | null = null;
  #lastAttempt: Attempt | null = null;
  #activation: Activation | null = null;
  #showing: Attempt | null = null;
  #hiding = false;
  #interactionClose = false;
  #positionRequest = 0;
  #axes = "";
  #positionDirty = false;
  #positionResult: PositionResult | null = null;
  #stopTracking: (() => void) | null = null;

  readonly #desired = computed(() => this.#host.intent().open);
  readonly #content = computed(() => this.#host.parts().content);
  /** Shown, accepted as current, intent open and every presentation ancestor requested. */
  readonly participating = computed(
    () => this.#participating() && this.#desired() && this.#ancestorsRequested(),
  );
  readonly #configuration = computed<PositionConfiguration | null>(() => {
    const content = this.#content();

    if (content === null) {
      return null;
    }

    const options = content.options();
    const gap = options.gap();

    if (!Number.isFinite(gap) || gap < 0) {
      throw new RangeError(`${this.#host.label} gap must be finite and nonnegative (CSS pixels).`);
    }

    return { id: options.id(), side: options.side(), align: options.align(), gap };
  });

  constructor(host: ɵOrigamiFloatingHost) {
    this.#host = host;
    this.#preparation = new FloatingPreparation(
      injectUniqueValue(`${host.label.toLowerCase()}-preparation`),
    );

    effect(() => {
      this.#pulse();
      this.#host.intent();
      this.#host.parts();
      this.#configuration();

      const parent = this.#parent();

      if (parent !== null) {
        parent.ready();
        parent.requested();
      }

      this.#content()?.presence.phase();
      untracked(() => this.synchronize());
    });

    afterEveryRender({
      earlyRead: () => {
        this.#observeAxes();
      },
      write: () => this.#write(),
      read: () => this.#read(),
    });
  }

  /** Called last in the owner's teardown: leaves the parent and hides without exit retention. */
  destroy(): void {
    this.#destroyed = true;
    untracked(this.#parent)?.removeChild(this);
    this.suppress();
  }

  /** Marks the next observed close as a user dismissal, writes it through `write`, then synchronizes. */
  closeFromInteraction(write: () => void): void {
    this.#interactionClose = true;
    write();
    this.synchronize();
  }

  /** Stacking order of the current activation, -1 without one. */
  order(): number {
    return this.#activation?.order ?? -1;
  }

  /** The current activation, compared by identity in branch snapshots. */
  activation(): object | null {
    return this.#activation;
  }

  epoch(): number {
    return this.#presentationEpoch;
  }

  ready(): boolean {
    return this.#ready();
  }

  desired(): boolean {
    return this.#desired();
  }

  requested(): boolean {
    return !this.#destroyed && this.#desired() && this.#ancestorsRequested();
  }

  /** A revealed parent can move this activation's reference: position again. */
  parentRevealed(): void {
    this.#requestPosition();
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
   * Shown and accepted as current, intent open and every presentation ancestor requested.
   * Synchronizes first; grants participation to an activation still inside `showPopover()`.
   */
  isParticipating(): boolean {
    this.synchronize();

    const activation = this.#activation;

    if (
      activation === null ||
      !this.canPresent() ||
      !activation.content.element.matches(":popover-open")
    ) {
      return false;
    }

    // Native autofocus is synchronous inside showPopover. Escape dispatched by
    // consumer focus callbacks belongs to this actual activation before show returns.
    if (this.#showing !== null && this.#attemptMatches(this.#showing)) {
      this.#grantParticipation(activation);
    }

    return this.#participating();
  }

  /** Observes a native `toggle` event on the Content host. */
  nativeToggle(element: HTMLElement): void {
    if (this.#destroyed || this.#content()?.element !== element) {
      return;
    }

    // Native events are observations, never model writers. A queued/coalesced event
    // does not describe current intent, nor necessarily the activation that queued it.
    if (!element.matches(":popover-open") && !this.#hiding && this.#showing === null) {
      this.#releaseActivation();
    }

    this.schedule();
  }

  #ancestorsRequested(): boolean {
    const parent = this.#parent();

    return parent === null || parent.requested();
  }

  /** Requested, its parts complete and its parent ready and presenting. */
  canPresent(): boolean {
    const parts = this.#host.parts();
    const parent = this.#parent();

    return (
      !this.#destroyed &&
      this.#desired() &&
      parts.complete &&
      (parent === null || (parent.ready() && parent.canPresent()))
    );
  }

  synchronize(): void {
    if (this.#destroyed) {
      return;
    }

    this.#resolveParent();

    const intent = this.#host.intent();
    const previous = this.#seenIntent;

    if (intent !== previous) {
      this.#seenIntent = intent;
      // A positioning failure may have latched this intent before synchronization observed it.
      this.#lastAttempt = null;
      this.#invalidatePosition();

      if (!intent.open) {
        this.#participating.set(false);
        this.#setReady(false);
        this.#host.closed(previous, this.#interactionClose);

        for (const child of this.#children()) {
          if (this.#destroyed || this.#host.intent() !== intent) {
            this.#interactionClose = false;
            this.schedule();

            return;
          }

          if (child.desired()) {
            child.suppress();
          }
        }
      }

      this.#interactionClose = false;
    }

    const configuration = this.#configuration();

    if (configuration !== this.#seenConfiguration) {
      this.#seenConfiguration = configuration;
      // A positioning failure may have latched this configuration before synchronization observed it.
      this.#lastAttempt = null;
      this.#requestPosition();
    }

    const missing = !this.#host.parts().complete;
    const parent = this.#parent();
    const parentSuppressed =
      parent !== null && !parent.canPresent() && (this.#desired() || !parent.retainingExit());
    const activation = this.#activation;
    const replaced = activation !== null && !this.#ownsActivation(activation);

    if (!this.#server && (missing || parentSuppressed || replaced)) {
      this.suppress();
    }
  }

  /** Becomes the child of the parent the host resolves now, leaving the previous one. */
  #resolveParent(): void {
    const parent = this.#host.parent();
    const previous = untracked(this.#parent);

    if (parent === previous) {
      return;
    }

    previous?.removeChild(this);
    parent?.addChild(this);
    this.#parent.set(parent);
  }

  retainingExit(): boolean {
    const activation = this.#activation;

    return (
      !this.#desired() &&
      activation !== null &&
      activation.revealed &&
      activation.content.presence.phase() === "closing"
    );
  }

  schedule(): void {
    if (!this.#destroyed) {
      this.#pulse.update((value) => value + 1);
      this.#changeDetector.markForCheck();
    }
  }

  #invalidatePosition(): void {
    this.#positionRequest += 1;
    this.#positionResult = null;
    this.#positionDirty = true;
  }

  #requestPosition(): void {
    this.#invalidatePosition();
    this.schedule();
  }

  #attemptMatches(attempt: Attempt): boolean {
    return (
      this.canPresent() &&
      this.#host.intent() === attempt.intent &&
      this.#host.parts() === attempt.parts &&
      this.#configuration() === attempt.configuration &&
      this.#parentRevision() === attempt.parentRevision
    );
  }

  #sameAttempt(left: Attempt | null, right: Attempt): boolean {
    return (
      left !== null &&
      left.intent === right.intent &&
      left.parts === right.parts &&
      left.configuration === right.configuration &&
      left.parentRevision === right.parentRevision
    );
  }

  #setReady(value: boolean): void {
    if (value !== this.#ready()) {
      this.#presentationEpoch += 1;
      this.#ready.set(value);
    }
  }

  #parentRevision(): number {
    const parent = this.#parent();

    if (parent === null) {
      return 0;
    }

    return parent.epoch();
  }

  #grantParticipation(activation: Activation): void {
    if (activation.order < 0) {
      activation.order = this.#host.nextOrder();
    }

    this.#participating.set(true);
  }

  #write(): void {
    if (this.#destroyed || this.#server || this.#hiding) {
      return;
    }

    this.synchronize();

    const parts = this.#host.parts();
    const content = parts.content;

    if (content === null) {
      return;
    }

    if (this.canPresent()) {
      const configuration = this.#configuration()!;
      const attempt: Attempt = {
        intent: this.#host.intent(),
        parts,
        configuration,
        parentRevision: this.#parentRevision(),
      };
      let activation = this.#activation;

      if (activation === null) {
        if (
          this.#sameAttempt(this.#lastAttempt, attempt) ||
          !content.presence.open() ||
          !content.element.isConnected
        ) {
          return;
        }

        this.#lastAttempt = attempt;
        activation = {
          parts,
          reference: parts.reference!,
          content,
          order: -1,
          revealed: false,
        };
        this.#activation = activation;
        this.#preparation.prepare(content.element);
        content.element.inert = false;
        this.#showing = attempt;

        try {
          content.element.showPopover();
        } catch (error) {
          const obsoleteLifetime = this.#destroyed || this.#content() !== content;

          // Native validity is rechecked after beforetoggle. Caller-scoped teardown
          // may have removed this captured lifetime during that synchronous callback.
          if (
            obsoleteLifetime &&
            error instanceof DOMException &&
            error.name === "InvalidStateError"
          ) {
            if (this.#activation === activation) {
              // Finish deferred non-native teardown after showPopover has unwound.
              this.#releaseActivation();
            }

            return;
          }

          throw error;
        } finally {
          this.#showing = null;
        }

        this.synchronize();

        if (
          this.#activation !== activation ||
          !this.#attemptMatches(attempt) ||
          !content.element.matches(":popover-open")
        ) {
          if (this.#activation === activation) {
            if (!this.#desired() || !this.canPresent() || !this.#ownsActivation(activation)) {
              this.#hide(activation);
            } else if (!content.element.matches(":popover-open")) {
              this.#releaseActivation();
            }
          }

          this.schedule();

          return;
        }

        this.#grantParticipation(activation);
        this.#requestPosition();
      } else {
        if (!content.element.isConnected || !content.element.matches(":popover-open")) {
          this.#releaseActivation();
          this.schedule();

          return;
        }

        // Reopening before hide starts reuses promotion/order and native autofocus.
        this.#grantParticipation(activation);
      }

      if (!activation.revealed) {
        this.#preparation.prepare(content.element);
      }

      content.element.inert = false;

      const result = this.#positionResult;

      if (result !== null && this.#resultCurrent(result)) {
        content.element.style.setProperty("left", `${result.x}px`);
        content.element.style.setProperty("top", `${result.y}px`);
        this.#preparation.release(content.element);
        content.presentation.commitReveal(result.transition);
        activation.revealed = true;
        this.#setReady(true);
        this.#positionResult = null;

        for (const child of this.#children()) {
          child.parentRevealed();
        }
      } else if (activation.revealed && content.presence.phase() === "opening") {
        // A retained-exit reversal already has valid coordinates. It still needs
        // its own entering binding and reveal barrier, but not another show call.
        const transition = content.presentation.captureTransition();

        if (content.presentation.enteringAllowed(transition)) {
          content.presentation.commitReveal(transition);
          this.#setReady(true);
        } else {
          content.presentation.permitEnter(transition);
          this.schedule();
        }
      }

      return;
    }

    this.#participating.set(false);
    this.#setReady(false);
    content.element.inert = true;

    const activation = this.#activation;

    if (activation === null) {
      return;
    }

    if (!this.#desired() && activation.revealed && content.presence.phase() !== "closed") {
      // Visible exit discovery is Presence-owned after this inert/leaving WRITE.
      // No new geometry/reveal result, nor position sequence, gates its completion.
      const result = this.#positionResult;

      if (result !== null && this.#resultCurrent(result)) {
        content.element.style.setProperty("left", `${result.x}px`);
        content.element.style.setProperty("top", `${result.y}px`);
        this.#positionResult = null;
      }

      return;
    }

    this.#hide(activation);
  }

  /** Observes a connected reference's axes and returns the scalars read; a change invalidates the position. */
  #observeAxes(): PositionAxes | null {
    const activation = this.#activation;

    if (this.#destroyed || activation === null || !activation.reference.isConnected) {
      return null;
    }

    const reference = activation.reference;
    const style = reference.ownerDocument.defaultView!.getComputedStyle(reference);
    const writingMode = style.writingMode;
    const direction = style.direction;
    const axes = `${writingMode}/${direction}`;

    if (axes !== this.#axes) {
      this.#axes = axes;
      this.#invalidatePosition();
    }

    return { writingMode, direction };
  }

  #read(): void {
    if (this.#destroyed || this.#server) {
      return;
    }

    const activation = this.#activation;

    if (activation === null || !this.#trackingAllowed(activation)) {
      return;
    }

    // Native WRITE callbacks may have changed the axes since earlyRead; position with this READ's.
    let axes = this.#observeAxes();

    if (this.#stopTracking === null) {
      // autoUpdate attaches ancestor listeners before constructing these observers, and
      // returns no cleanup if construction throws. Check first so acquisition is all-or-nothing.
      if (typeof ResizeObserver !== "function" || typeof IntersectionObserver !== "function") {
        this.#failPosition(
          activation,
          new Error(
            `${this.#host.label} position tracking requires ResizeObserver and IntersectionObserver.`,
          ),
        );

        return;
      }

      this.#stopTracking = autoUpdate(
        activation.reference,
        activation.content.element,
        () => this.#requestPosition(),
        {
          ancestorScroll: true,
          ancestorResize: true,
          elementResize: true,
          layoutShift: true,
          animationFrame: false,
        },
      );
    }

    if (!this.#positionDirty) {
      return;
    }

    this.#positionDirty = false;

    const configuration = this.#configuration()!;
    const intent = this.#host.intent();
    const request = this.#positionRequest;
    const content = activation.content;
    const transition = content.presentation.captureTransition();
    let computation: ReturnType<typeof positionContent>;

    try {
      if (axes === null) {
        // A disconnected reference is not observed, yet its computed axes still decide this position.
        const reference = activation.reference;
        const style = reference.ownerDocument.defaultView!.getComputedStyle(reference);

        axes = { writingMode: style.writingMode, direction: style.direction };
      }

      computation = positionContent(
        activation.reference,
        content.element,
        configuration,
        axes,
        this.#host,
      );
    } catch (error) {
      this.#failPosition(activation, error);

      return;
    }

    void computation.then(
      (coordinates) => {
        const result: PositionResult = {
          activation,
          intent,
          configuration,
          request,
          transition,
          x: coordinates.x,
          y: coordinates.y,
        };

        if (!this.#resultCurrent(result)) {
          return;
        }

        this.#positionResult = result;

        if (this.#desired()) {
          content.presentation.permitEnter(transition);
        }

        this.schedule();
      },
      (error: unknown) => {
        const snapshot: PositionSnapshot = {
          activation,
          intent,
          configuration,
          request,
          transition,
        };

        // An obsolete rejection is still reported, but never ends a newer presentation.
        if (!this.#resultCurrent(snapshot)) {
          this.#errorHandler.handleError(error);

          return;
        }

        this.#failPosition(activation, error);
      },
    );
  }

  /** A positioning failure ends its native activation without exit retention; the error is reported, not swallowed. */
  #failPosition(activation: Activation, error: unknown): void {
    if (this.#activation === activation) {
      // Record the failed attempt itself, captured before hide callbacks can change it.
      // Unlike other native hides, only a later intent, part, configuration or parent change retries.
      const attempt: Attempt = {
        intent: this.#host.intent(),
        parts: this.#host.parts(),
        configuration: this.#configuration()!,
        parentRevision: this.#parentRevision(),
      };

      this.#hide(activation);
      this.#lastAttempt = attempt;
    }

    this.#errorHandler.handleError(error);
  }

  /** The owner's parts object changes identity exactly when one of its parts changes. */
  #ownsActivation(activation: Activation): boolean {
    return this.#host.parts() === activation.parts;
  }

  #trackingAllowed(activation: Activation): boolean {
    if (
      this.#destroyed ||
      this.#hiding ||
      this.#activation !== activation ||
      !this.#ownsActivation(activation) ||
      !activation.content.element.isConnected ||
      !activation.content.element.matches(":popover-open")
    ) {
      return false;
    }

    if (this.canPresent()) {
      return true;
    }

    return (
      !this.#desired() && activation.revealed && activation.content.presence.phase() === "closing"
    );
  }

  #resultCurrent(snapshot: PositionSnapshot): boolean {
    return (
      this.#trackingAllowed(snapshot.activation) &&
      this.#host.intent() === snapshot.intent &&
      this.#configuration() === snapshot.configuration &&
      this.#positionRequest === snapshot.request &&
      snapshot.activation.content.presentation.captureTransition() === snapshot.transition
    );
  }

  #hide(activation: Activation): void {
    if (this.#activation !== activation) {
      return;
    }

    const content = activation.content;

    this.#participating.set(false);
    this.#setReady(false);
    this.#invalidatePosition();
    this.#stopTracking?.();
    this.#stopTracking = null;
    this.#hiding = true;

    try {
      if (content.element.isConnected && content.element.matches(":popover-open")) {
        content.element.hidePopover();
      }
    } finally {
      this.#hiding = false;

      if (this.#activation === activation) {
        this.#releaseActivation();
      }
    }

    // Hiding cannot be canceled, including reentry from closing beforetoggle.
    // New intent is reconciled only after the native call returned.
    if (!this.#destroyed && this.#desired() && this.#content() === content) {
      this.#lastAttempt = null;
      this.schedule();
    }
  }

  #releaseActivation(): void {
    const activation = this.#activation;

    if (activation === null) {
      return;
    }

    this.#activation = null;
    this.#participating.set(false);
    this.#setReady(false);
    this.#invalidatePosition();
    this.#stopTracking?.();
    this.#stopTracking = null;
    this.#preparation.release(activation.content.element);
    activation.content.presentation.reset();
    activation.content.element.inert = true;
  }

  /** Hides without exit retention and keeps intent; presentation children are suppressed first. */
  suppress(): void {
    if (this.#server) {
      return;
    }

    const activation = this.#activation;

    this.#participating.set(false);
    this.#setReady(false);

    for (const child of this.#children()) {
      child.suppress();
    }

    if (activation !== null && !this.#hiding && this.#showing === null) {
      this.#hide(activation);
    }
  }
}
