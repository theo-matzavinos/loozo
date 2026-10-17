import {
  ChangeDetectorRef,
  DestroyRef,
  Directive,
  ErrorHandler,
  InjectionToken,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  model,
  signal,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { autoUpdate } from "@floating-ui/dom";
import { OrigamiPresenceState, ɵOrigamiPresencePresentation } from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import type { OrigamiPopoverAnchorOptions } from "./popover-anchor";
import type { OrigamiPopoverContentOptions } from "./popover-content";
import { positionContent } from "./popover-position";
import type { PositionAxes, PositionConfiguration } from "./popover-position";
import { PopoverParticipants } from "./popover-participants";
import type { Branch, BranchMember } from "./popover-participants";
import { PopoverPreparation } from "./popover-preparation";

const popoverReplacement = new InjectionToken<OrigamiPopoverOptions>(
  "OrigamiPopoverOptions replacement",
);

/** Whole, substitutable root configuration; aliases are resolved after construction. */
export abstract class OrigamiPopoverOptions {
  /** Requested open state, writable by behavior; direct model default false. Not native visibility or exit retention. */
  abstract readonly open: WritableSignal<boolean>;
  /** Prevents Trigger activation, default false. External writes and dismissal remain authoritative. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * User branch-dismissal permission, direct default true. The owner's own Trigger may bypass
   * only this owner's flag; any protected requested-open descendant still vetoes the whole
   * branch without partial writes. Script/model close ignores this permission.
   */
  abstract readonly dismissible: Signal<boolean>;

  /**
   * Replaces all root Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references.
   * @returns Local replacement and public alias providers. A co-matched primitive default cannot override them in either import order.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverOptions> | AbstractType<OrigamiPopoverOptions>,
  ): Provider[] {
    return [
      { provide: popoverReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPopoverOptions, useExisting: popoverReplacement },
    ];
  }

  /**
   * Replaces all root Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying every required signal. Ordinary writable signals are valid.
   * @returns Local replacement and public alias providers; writes do not fabricate outputs from an unused directive model.
   */
  static provideFactory(factory: () => OrigamiPopoverOptions): Provider[] {
    return [
      { provide: popoverReplacement, useFactory: factory },
      { provide: OrigamiPopoverOptions, useExisting: popoverReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback provider, not a supported application API.
   * @param type - Deferred directive default, resolved only when Options are read after construction.
   * @returns A local array holding one public-token factory that honors a same-host replacement before resolving the directive default.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPopoverOptions> | AbstractType<OrigamiPopoverOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPopoverOptions,
        useFactory: () => {
          const replacement = inject(popoverReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(type());
        },
      },
    ];
  }
}

export type Intent = { readonly open: boolean };
export type Policy = { readonly disabled: boolean; readonly dismissible: boolean };
type IdentityPart = {
  readonly element: HTMLElement;
  readonly options: () => { readonly id: Signal<string> };
};
type ContentPart = {
  readonly element: HTMLElement;
  readonly options: () => OrigamiPopoverContentOptions;
  readonly presence: OrigamiPresenceState;
  readonly presentation: ɵOrigamiPresencePresentation;
};
export type Parts = {
  readonly trigger: IdentityPart | null;
  readonly anchor: IdentityPart | null;
  readonly content: ContentPart | null;
};
type CompleteParts = {
  readonly trigger: IdentityPart;
  readonly anchor: IdentityPart;
  readonly content: ContentPart;
};
type Attempt = {
  readonly intent: Intent;
  readonly parts: Parts;
  readonly configuration: PositionConfiguration;
  readonly parentRevision: number;
};
export type Activation = { readonly parts: CompleteParts; order: number; revealed: boolean };
type PositionSnapshot = {
  readonly activation: Activation;
  readonly intent: Intent;
  readonly configuration: PositionConfiguration;
  readonly request: number;
  readonly transition: number;
};
type PositionResult = PositionSnapshot & { readonly x: number; readonly y: number };

/** @internal Nearest logical Popover owner. Not exported as an application authoring API. */
@Service({ autoProvided: false })
export class PopoverContext {
  readonly parent = inject(PopoverContext, { optional: true, skipSelf: true });
  readonly #scene = inject(PopoverParticipants);
  readonly #changeDetector = inject(ChangeDetectorRef);
  readonly #errorHandler = inject(ErrorHandler);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #options = injectDeferred(OrigamiPopoverOptions);
  readonly #preparation = new PopoverPreparation(injectUniqueValue("popover-preparation"));
  readonly #trigger = signal<IdentityPart | null>(null);
  readonly #anchor = signal<IdentityPart | null>(null);
  readonly #content = signal<ContentPart | null>(null);
  readonly #children = new Set<PopoverContext>();
  readonly #structure = signal(0);
  readonly #participating = signal(false);
  readonly #ready = signal(false);
  readonly #pulse = signal(0);
  #destroyed = false;
  #presentationEpoch = 0;
  #seenIntent: Intent | null = null;
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

  // Object identity detects invalidated/recomputed effective signal decisions, including
  // net-equal close/reopen before a pointer snapshot's next observation.
  readonly intent = computed<Intent>(() => ({ open: this.#options().open() }));
  readonly #policy = computed<Policy>(() => ({
    disabled: this.#options().disabled(),
    dismissible: this.#options().dismissible(),
  }));
  readonly desired = computed(() => this.intent().open);
  readonly disabled = computed(() => this.#policy().disabled);
  readonly dismissible = computed(() => this.#policy().dismissible);
  readonly parts = computed<Parts>(() => ({
    trigger: this.#trigger(),
    anchor: this.#anchor(),
    content: this.#content(),
  }));
  readonly participating = computed(
    () => this.#participating() && this.desired() && this.#ancestorsRequested(),
  );
  readonly contentId = computed(() => this.#content()?.options().id() ?? null);
  readonly #configuration = computed<PositionConfiguration | null>(() => {
    const content = this.#content();

    if (content === null) {
      return null;
    }

    const options = content.options();
    const gap = options.gap();

    if (!Number.isFinite(gap) || gap < 0) {
      throw new RangeError("Popover gap must be finite and nonnegative (CSS pixels).");
    }

    return { id: options.id(), side: options.side(), align: options.align(), gap };
  });

  constructor() {
    this.#scene.register(this);

    if (this.parent !== null) {
      this.parent.#children.add(this);
      this.parent.#structure.update((value) => value + 1);
    }

    effect(() => {
      this.#pulse();
      this.intent();
      this.parts();
      this.#configuration();

      if (this.parent !== null) {
        this.parent.#ready();
        this.parent.desired();
      }

      this.#content()?.presence.phase();
      untracked(() => this.#synchronize());
    });

    afterEveryRender({
      earlyRead: () => {
        this.#observeAxes();
      },
      write: () => this.#write(),
      read: () => this.#read(),
    });

    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#scene.unregister(this);

      if (this.parent !== null) {
        this.parent.#children.delete(this);
        this.parent.#structure.update((value) => value + 1);
      }

      this.#suppress();
    });
  }

  /** Registers the Trigger from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrigger(part: IdentityPart, destroyRef: DestroyRef): void {
    this.#register(this.#trigger, part, "trigger", destroyRef);
  }

  /** Registers the Anchor from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerAnchor(part: IdentityPart, destroyRef: DestroyRef): void {
    this.#register(this.#anchor, part, "anchor", destroyRef);
  }

  /** Registers Content from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerContent(part: ContentPart, destroyRef: DestroyRef): void {
    this.#register(this.#content, part, "content", destroyRef);
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #register<T>(
    slot: WritableSignal<T | null>,
    part: T,
    role: string,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (slot() !== null) {
      throw new Error(`Popover supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (slot() === part) {
        this.#suppress();
        slot.set(null);
        this.#lastAttempt = null;
        this.#structure.update((value) => value + 1);
        this.#schedule();
      }
    });
  }

  anchorId(element: HTMLElement, options: () => OrigamiPopoverAnchorOptions): string {
    const trigger = this.#trigger();

    if (trigger !== null && trigger.element === element) {
      return trigger.options().id();
    }

    return options().id();
  }

  activateTrigger(): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    if (this.desired()) {
      this.#scene.dismiss(this.captureBranch(), "trigger", true);
    } else {
      this.#options().open.set(true);
      this.#synchronize();
    }
  }

  captureBranch(): Branch {
    const members: BranchMember[] = [];
    const visit = (owner: PopoverContext) => {
      for (const child of owner.#children) {
        visit(child);
      }

      members.push({
        context: owner,
        intent: owner.intent(),
        parts: owner.parts(),
        policy: owner.#policy(),
        structure: owner.#structure(),
        activation: owner.#activation,
        presentationEpoch: owner.#presentationEpoch,
        ready: owner.#ready(),
      });
    };

    visit(this);

    return { owner: this, members };
  }

  matches(member: BranchMember): boolean {
    return (
      !this.#destroyed &&
      this.intent() === member.intent &&
      this.parts() === member.parts &&
      this.#policy() === member.policy &&
      this.#structure() === member.structure &&
      this.#activation === member.activation &&
      this.#presentationEpoch === member.presentationEpoch
    );
  }

  acceptCloseEpoch(member: BranchMember): boolean {
    let expectedEpoch = member.presentationEpoch;

    if (member.ready) {
      expectedEpoch += 1;
    }

    if (this.#presentationEpoch !== expectedEpoch) {
      return false;
    }

    member.presentationEpoch = expectedEpoch;

    return true;
  }

  closeFromInteraction(): void {
    this.#interactionClose = true;
    this.#options().open.set(false);
    this.#synchronize();
  }

  containsPath(path: EventTarget[]): boolean {
    for (const part of [this.#trigger(), this.#anchor(), this.#content()]) {
      if (part === null) {
        continue;
      }

      for (const target of path) {
        if (target instanceof Node && (target === part.element || part.element.contains(target))) {
          return true;
        }
      }
    }

    for (const child of this.#children) {
      if (child.containsPath(path)) {
        return true;
      }
    }

    return false;
  }

  #containsFocus(focus: Element | null): boolean {
    if (focus === null) {
      return false;
    }

    const content = this.#content();

    if (content !== null && content.element.contains(focus)) {
      return true;
    }

    for (const child of this.#children) {
      if (child.#containsFocus(focus)) {
        return true;
      }
    }

    return false;
  }

  restoreFocus(expectedFocus: Element | null): void {
    const trigger = this.#trigger();

    if (
      this.#destroyed ||
      trigger === null ||
      this.disabled() ||
      !trigger.element.isConnected ||
      trigger.element.matches(":disabled") ||
      trigger.element.closest("[inert]") !== null ||
      this.#scene.document.activeElement !== expectedFocus
    ) {
      return;
    }

    trigger.element.focus();
  }

  order(): number {
    return this.#activation?.order ?? -1;
  }

  branchOrder(): number {
    let order = this.order();

    for (const child of this.#children) {
      order = Math.max(order, child.branchOrder());
    }

    return order;
  }

  isParticipating(): boolean {
    this.#synchronize();

    const activation = this.#activation;

    if (
      activation === null ||
      !this.#canPresent() ||
      !activation.parts.content.element.matches(":popover-open")
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

  nativeToggle(element: HTMLElement): void {
    if (this.#destroyed || this.#content()?.element !== element) {
      return;
    }

    // Native events are observations, never model writers. A queued/coalesced event
    // does not describe current intent, nor necessarily the activation that queued it.
    if (!element.matches(":popover-open") && !this.#hiding && this.#showing === null) {
      this.#releaseActivation();
    }

    this.#schedule();
  }

  #ancestorsRequested(): boolean {
    let ancestor = this.parent;

    while (ancestor !== null) {
      if (ancestor.#destroyed || !ancestor.desired()) {
        return false;
      }

      ancestor = ancestor.parent;
    }

    return true;
  }

  #canPresent(): boolean {
    const parts = this.parts();

    return (
      !this.#destroyed &&
      this.desired() &&
      parts.trigger !== null &&
      parts.anchor !== null &&
      parts.content !== null &&
      (this.parent === null || (this.parent.#ready() && this.parent.#canPresent()))
    );
  }

  #synchronize(): void {
    if (this.#destroyed) {
      return;
    }

    const intent = this.intent();
    const previous = this.#seenIntent;

    if (intent !== previous) {
      this.#seenIntent = intent;
      this.#lastAttempt = null;
      this.#invalidatePosition();

      if (!intent.open) {
        const focus = this.#scene.document.activeElement;
        const restore =
          previous?.open === true && !this.#interactionClose && this.#containsFocus(focus);

        this.#participating.set(false);
        this.#setReady(false);

        // Restore only the owning closing trigger, never each suppressed descendant.
        if (restore && !this.#server) {
          this.restoreFocus(focus);
        }

        for (const child of this.#children) {
          if (this.#destroyed || this.intent() !== intent) {
            this.#interactionClose = false;
            this.#schedule();

            return;
          }

          if (child.desired()) {
            child.#suppress();
          }
        }
      }

      this.#interactionClose = false;
    }

    const configuration = this.#configuration();

    if (configuration !== this.#seenConfiguration) {
      this.#seenConfiguration = configuration;
      this.#lastAttempt = null;
      this.#requestPosition();
    }

    const parts = this.parts();
    const missing = parts.trigger === null || parts.anchor === null || parts.content === null;
    const parentSuppressed =
      this.parent !== null &&
      !this.parent.#canPresent() &&
      (this.desired() || !this.parent.#retainingExit());
    const activation = this.#activation;
    const replaced = activation !== null && !this.#ownsActivation(activation);

    if (!this.#server && (missing || parentSuppressed || replaced)) {
      this.#suppress();
    }
  }

  #retainingExit(): boolean {
    const activation = this.#activation;

    return (
      !this.desired() &&
      activation !== null &&
      activation.revealed &&
      activation.parts.content.presence.phase() === "closing"
    );
  }

  #schedule(): void {
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
    this.#schedule();
  }

  #attemptMatches(attempt: Attempt): boolean {
    return (
      !this.#destroyed &&
      this.#canPresent() &&
      this.intent() === attempt.intent &&
      this.parts() === attempt.parts &&
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
    if (this.parent === null) {
      return 0;
    }

    return this.parent.#presentationEpoch;
  }

  #grantParticipation(activation: Activation): void {
    if (activation.order < 0) {
      activation.order = this.#scene.nextOrder();
    }

    this.#participating.set(true);
  }

  #write(): void {
    if (this.#destroyed || this.#server || this.#hiding) {
      return;
    }

    this.#synchronize();

    const parts = this.parts();
    const content = parts.content;

    if (content === null) {
      return;
    }

    if (this.#canPresent()) {
      const configuration = this.#configuration()!;
      const attempt: Attempt = {
        intent: this.intent(),
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
          parts: { trigger: parts.trigger!, anchor: parts.anchor!, content },
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

        this.#synchronize();

        if (
          this.#activation !== activation ||
          !this.#attemptMatches(attempt) ||
          !content.element.matches(":popover-open")
        ) {
          if (this.#activation === activation) {
            if (!this.desired() || !this.#canPresent() || !this.#ownsActivation(activation)) {
              this.#hide(activation);
            } else if (!content.element.matches(":popover-open")) {
              this.#releaseActivation();
            }
          }

          this.#schedule();

          return;
        }

        this.#grantParticipation(activation);
        this.#requestPosition();
      } else {
        if (!content.element.isConnected || !content.element.matches(":popover-open")) {
          this.#releaseActivation();
          this.#schedule();

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

        for (const child of this.#children) {
          child.#requestPosition();
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
          this.#schedule();
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

    if (!this.desired() && activation.revealed && content.presence.phase() !== "closed") {
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

  /** Observes a connected Anchor's axes and returns the scalars read; a change invalidates the position. */
  #observeAxes(): PositionAxes | null {
    const activation = this.#activation;

    if (this.#destroyed || activation === null || !activation.parts.anchor.element.isConnected) {
      return null;
    }

    const anchor = activation.parts.anchor.element;
    const style = anchor.ownerDocument.defaultView!.getComputedStyle(anchor);
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
          new Error("Popover position tracking requires ResizeObserver and IntersectionObserver."),
        );

        return;
      }

      this.#stopTracking = autoUpdate(
        activation.parts.anchor.element,
        activation.parts.content.element,
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
    const intent = this.intent();
    const request = this.#positionRequest;
    const content = activation.parts.content;
    const transition = content.presentation.captureTransition();
    let computation: ReturnType<typeof positionContent>;

    try {
      if (axes === null) {
        // A disconnected Anchor is not observed, yet its computed axes still decide this position.
        const anchor = activation.parts.anchor.element;
        const style = anchor.ownerDocument.defaultView!.getComputedStyle(anchor);

        axes = { writingMode: style.writingMode, direction: style.direction };
      }

      computation = positionContent(
        activation.parts.anchor.element,
        content.element,
        configuration,
        axes,
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

        if (this.desired()) {
          content.presentation.permitEnter(transition);
        }

        this.#schedule();
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
        intent: this.intent(),
        parts: this.parts(),
        configuration: this.#configuration()!,
        parentRevision: this.#parentRevision(),
      };

      this.#hide(activation);
      this.#lastAttempt = attempt;
    }

    this.#errorHandler.handleError(error);
  }

  #ownsActivation(activation: Activation): boolean {
    const parts = this.parts();

    return (
      parts.content === activation.parts.content &&
      parts.anchor === activation.parts.anchor &&
      parts.trigger === activation.parts.trigger
    );
  }

  #trackingAllowed(activation: Activation): boolean {
    const parts = this.parts();

    if (
      this.#destroyed ||
      this.#hiding ||
      this.#activation !== activation ||
      parts.content !== activation.parts.content ||
      parts.anchor !== activation.parts.anchor ||
      parts.trigger !== activation.parts.trigger ||
      !activation.parts.content.element.isConnected ||
      !activation.parts.content.element.matches(":popover-open")
    ) {
      return false;
    }

    if (this.#canPresent()) {
      return true;
    }

    return (
      !this.desired() &&
      activation.revealed &&
      activation.parts.content.presence.phase() === "closing"
    );
  }

  #resultCurrent(snapshot: PositionSnapshot): boolean {
    return (
      this.#trackingAllowed(snapshot.activation) &&
      this.intent() === snapshot.intent &&
      this.#configuration() === snapshot.configuration &&
      this.#positionRequest === snapshot.request &&
      snapshot.activation.parts.content.presentation.captureTransition() === snapshot.transition
    );
  }

  #hide(activation: Activation): void {
    if (this.#activation !== activation || this.#hiding) {
      return;
    }

    const content = activation.parts.content;

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
    if (!this.#destroyed && this.desired() && this.#content() === content) {
      this.#lastAttempt = null;
      this.#schedule();
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
    this.#preparation.release(activation.parts.content.element);
    activation.parts.content.presentation.reset();
    activation.parts.content.element.inert = true;
  }

  #suppress(): void {
    if (this.#server) {
      return;
    }

    const activation = this.#activation;

    this.#participating.set(false);
    this.#setReady(false);

    for (const child of this.#children) {
      child.#suppress();
    }

    if (activation !== null && !this.#hiding && this.#showing === null) {
      this.#hide(activation);
    }
  }
}

/** Nearest root's locally provided readonly facade; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiPopoverState {
  readonly #context = inject(PopoverContext);
  /** Effective requested intent, not native participation, paint readiness or retained exit. Never writable. */
  readonly open: Signal<boolean> = this.#context.desired;
  /** Effective Trigger-disabled policy; external writes and Escape/outside dismissal are unaffected. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /**
   * Readonly effective user-dismissal permission. Own Trigger close bypasses only this owner's
   * flag; a protected requested-open descendant still vetoes the whole branch. Script/model
   * close ignores dismissal permission.
   */
  readonly dismissible: Signal<boolean> = this.#context.dismissible;
}

/**
 * Non-modal Popover owner with one mounted Trigger, explicit Anchor and persistent Content.
 * Missing roles or parent suppression hide presentation without erasing requested intent.
 * Descendants use the nearest logical Angular DI owner; unrelated roots can coexist.
 * Consumer roles, names, styling, dimensions, scrolling and animations remain consumer-owned.
 * No focus trap, scroll lock, menu semantics or focus-departure close is supplied.
 *
 * Escape targets the most recently successfully native-activated participating Origami
 * Popover. Already-prevented or composing key events are ignored; a dismissal veto consumes
 * the request without falling through to an ancestor or another root. Coordinate updates
 * and reopening a retained exit before native hide do not change that promotion order.
 *
 * Outside dismissal requires trusted primary-button down and matching up outside the affected
 * branch; nested descendants count as inside their ancestors. Inside-to-outside drags,
 * prevented events, mismatched pointer/button, and cancellation or capture loss before matching
 * pointerup invalidate the gesture. Matching pointerup ends acquisition: later cancellation or
 * capture loss does not veto completion. Dismissal runs after pointerup dispatch finishes so
 * later listeners can still prevent that up event, and only if the captured branch remains
 * current.
 *
 * A user close requires every requested-open branch member's permission. The owner's own
 * Trigger bypasses only its own flag. Veto performs no writes or outputs; accepted branch
 * writes proceed descendant before ancestor. Synchronous listeners may change or replace the
 * branch; remaining stale operations do not overwrite the new decision. Script/model close
 * is authoritative and suppresses descendants without clearing their requested intent.
 *
 * Escape restores the relevant live eligible Trigger once. Outside dismissal preserves outside
 * focus. Script close restores focus only when it remains inside the closing branch; suppressing
 * nested focused content restores the closing owner's Trigger once. Never restore a
 * disconnected, destroyed, disabled or inert Trigger, or steal focus moved elsewhere by a
 * listener.
 *
 * @example
 * ```html
 * <div ogPopover [(open)]="open">
 *   <button ogPopoverTrigger ogPopoverAnchor>Choose task</button>
 *   <section ogPopoverContent #content="ogPopoverContent" role="group" aria-label="Tasks" [gap]="8">
 *     @if (content.state.open()) { <button>Consumer-owned task</button> }
 *   </section>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogPopover]",
  exportAs: "ogPopover",
  providers: [
    PopoverContext,
    OrigamiPopoverState,
    OrigamiPopoverOptions.ɵprovideDefault(() => OrigamiPopover),
  ],
})
export class OrigamiPopover implements OrigamiPopoverOptions {
  /** Own requested-state model, default false; `openChange` emits accepted writes to this model. Replaced Options do not emit unused model outputs. */
  readonly open = model(false);
  /** Own boolean-attribute-coerced disabled input, default false. Blocks user Trigger activation, not authoritative writes or dismissal. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own boolean-attribute-coerced user-dismissal input, default true. Replaced Options drive
   * effective policy. Own Trigger close bypasses only this owner's flag; a protected
   * requested-open descendant vetoes the whole branch. Script/model close is authoritative.
   */
  readonly dismissible = input(true, { transform: booleanAttribute });
  /** Local readonly facade of effective root Options. */
  readonly state = inject(OrigamiPopoverState);
}
