import {
  ChangeDetectorRef,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { Signal, WritableSignal } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { autoUpdate } from "@floating-ui/dom";
import { OrigamiPresenceState, ɵOrigamiPresencePresentation } from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import {
  OrigamiPopoverOptions,
  OrigamiPopoverTriggerOptions,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverContentOptions,
} from "./options";
import { positionContent } from "./position";
import type { PositionConfiguration } from "./position";

type Intent = { readonly open: boolean };
type Policy = { readonly disabled: boolean; readonly dismissible: boolean };
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
type Parts = {
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
type Activation = { readonly parts: CompleteParts; order: number; revealed: boolean };
type PositionResult = {
  readonly activation: Activation;
  readonly intent: Intent;
  readonly configuration: PositionConfiguration;
  readonly request: number;
  readonly transition: number;
  readonly x: number;
  readonly y: number;
};
type BranchMember = {
  readonly context: PopoverContext;
  intent: Intent;
  readonly parts: Parts;
  readonly policy: Policy;
  readonly structure: number;
  readonly activation: Activation | null;
  presentationEpoch: number;
  readonly ready: boolean;
};
type Branch = { readonly owner: PopoverContext; readonly members: BranchMember[] };
type Gesture = { readonly event: PointerEvent; readonly branches: Branch[]; cancelled: boolean };
type StyleOverride = {
  readonly property: string;
  temporary: string;
  value: string;
  priority: string;
};

// Application-local event ownership, not a public overlay stack or global document singleton.
@Service()
class PopoverParticipants {
  readonly document = inject(DOCUMENT);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #owners = new Set<PopoverContext>();
  readonly #pendingTasks = new Set<ReturnType<typeof setTimeout>>();
  #nextOrder = 0;
  #gesture: Gesture | null = null;

  constructor() {
    if (this.#server) {
      return;
    }

    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }

      let topmost: PopoverContext | null = null;
      let order = -1;

      for (const owner of this.#owners) {
        if (owner.isParticipating() && owner.order() > order) {
          topmost = owner;
          order = owner.order();
        }
      }

      if (topmost !== null) {
        // A veto consumes the request as well; there is no ancestor fallthrough.
        event.preventDefault();
        this.dismiss(topmost.captureBranch(), "escape", false);
      }
    };
    const down = (event: PointerEvent) => {
      this.#gesture = null;

      if (!event.isTrusted || !event.isPrimary || event.button !== 0 || event.defaultPrevented) {
        return;
      }

      const path = event.composedPath();
      const candidates = new Set<PopoverContext>();

      for (const owner of this.#owners) {
        if (owner.isParticipating() && !owner.containsPath(path)) {
          candidates.add(owner);
        }
      }

      const branches: Branch[] = [];

      for (const owner of candidates) {
        let ancestor = owner.parent;
        let covered = false;

        while (ancestor !== null) {
          if (candidates.has(ancestor)) {
            covered = true;

            break;
          }

          ancestor = ancestor.parent;
        }

        if (!covered) {
          branches.push(owner.captureBranch());
        }
      }

      branches.sort((left, right) => right.owner.branchOrder() - left.owner.branchOrder());
      this.#gesture = { event, branches, cancelled: false };
    };
    const up = (event: PointerEvent) => {
      const gesture = this.#gesture;

      this.#gesture = null;

      if (gesture === null) {
        return;
      }

      const path = event.composedPath();

      // Native callback cleanup can run microtasks between listeners. A task sees
      // final prevention after the current dispatch, including later window consumers.
      this.#afterNativeDispatch(() => {
        if (
          gesture.cancelled ||
          !event.isTrusted ||
          !event.isPrimary ||
          event.button !== 0 ||
          event.defaultPrevented ||
          gesture.event.defaultPrevented ||
          event.pointerId !== gesture.event.pointerId ||
          event.button !== gesture.event.button
        ) {
          return;
        }

        for (const branch of gesture.branches) {
          if (
            this.fresh(branch) &&
            branch.owner.isParticipating() &&
            !branch.owner.containsPath(path)
          ) {
            this.dismiss(branch, "outside", false);
          }
        }
      });
    };
    const drag = (event: DragEvent) => {
      const gesture = this.#gesture;

      if (gesture === null || !event.isTrusted) {
        return;
      }

      this.#afterNativeDispatch(() => {
        if (event.defaultPrevented) {
          return;
        }

        // Completed native drag may omit pointercancel/up. Retire only its acquisition,
        // even if a newer DOWN or the old UP was captured before this task ran.
        gesture.cancelled = true;

        if (this.#gesture === gesture) {
          this.#gesture = null;
        }
      });
    };
    const cancel = () => {
      this.#gesture = null;
    };

    this.document.addEventListener("keydown", escape);
    this.document.addEventListener("pointerdown", down);
    this.document.addEventListener("pointerup", up);
    this.document.addEventListener("dragstart", drag);
    this.document.addEventListener("pointercancel", cancel);
    this.document.addEventListener("lostpointercapture", cancel);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener("keydown", escape);
      this.document.removeEventListener("pointerdown", down);
      this.document.removeEventListener("pointerup", up);
      this.document.removeEventListener("dragstart", drag);
      this.document.removeEventListener("pointercancel", cancel);
      this.document.removeEventListener("lostpointercapture", cancel);
      this.#gesture = null;

      for (const task of this.#pendingTasks) {
        clearTimeout(task);
      }

      this.#pendingTasks.clear();
    });
  }

  #afterNativeDispatch(callback: () => void): void {
    const task = setTimeout(() => {
      this.#pendingTasks.delete(task);
      callback();
    }, 0);

    this.#pendingTasks.add(task);
  }

  register(owner: PopoverContext): void {
    this.#owners.add(owner);
  }

  unregister(owner: PopoverContext): void {
    this.#owners.delete(owner);
  }

  nextOrder(): number {
    this.#nextOrder += 1;

    return this.#nextOrder;
  }

  fresh(branch: Branch): boolean {
    for (const member of branch.members) {
      if (!member.context.matches(member)) {
        return false;
      }
    }

    return true;
  }

  dismiss(branch: Branch, reason: "escape" | "outside" | "trigger", bypassOwner: boolean): void {
    if (!this.fresh(branch)) {
      return;
    }

    // Preflight every requested-open member before any model/output write.
    for (const member of branch.members) {
      if (
        member.intent.open &&
        !member.policy.dismissible &&
        !(bypassOwner && member.context === branch.owner)
      ) {
        return;
      }
    }

    const focus = this.document.activeElement;

    // The snapshot is already postorder: descendants before ancestor.
    for (const member of branch.members) {
      if (!this.fresh(branch)) {
        return;
      }

      if (!member.intent.open) {
        continue;
      }

      member.context.closeFromInteraction();

      if (member.context.intent().open) {
        return;
      }

      member.intent = member.context.intent();

      if (!member.context.acceptCloseEpoch(member)) {
        return;
      }

      if (!this.fresh(branch)) {
        return;
      }
    }

    if (reason !== "outside" && this.document.activeElement === focus && this.fresh(branch)) {
      branch.owner.restoreFocus(focus);
    }
  }
}

/** @internal Nearest logical Popover owner. Not exported as an application authoring API. */
@Service({ autoProvided: false })
export class PopoverContext {
  readonly parent = inject(PopoverContext, { optional: true, skipSelf: true });
  readonly #scene = inject(PopoverParticipants);
  readonly #changeDetector = inject(ChangeDetectorRef);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #options = injectDeferred(OrigamiPopoverOptions);
  readonly #preparationId = injectUniqueId("popover-preparation");
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
  #overrides: StyleOverride[] = [];

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
      earlyRead: () => this.#observeAxes(),
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

  registerTrigger(): void {
    this.#register(
      this.#trigger,
      {
        element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
        options: injectDeferred(OrigamiPopoverTriggerOptions),
      },
      "trigger",
    );
  }

  registerAnchor(): void {
    this.#register(
      this.#anchor,
      {
        element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
        options: injectDeferred(OrigamiPopoverAnchorOptions),
      },
      "anchor",
    );
  }

  registerContent(): void {
    this.#register(
      this.#content,
      {
        element: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
        options: injectDeferred(OrigamiPopoverContentOptions),
        presence: inject(OrigamiPresenceState),
        presentation: inject(ɵOrigamiPresencePresentation),
      },
      "content",
    );
  }

  #register<T>(slot: WritableSignal<T | null>, part: T, role: string): void {
    if (slot() !== null) {
      throw new Error(`Popover supports only one mounted ${role}.`);
    }

    slot.set(part);
    inject(DestroyRef).onDestroy(() => {
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
        this.#prepare(content.element);
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
        this.#prepare(content.element);
      }

      content.element.inert = false;

      const result = this.#positionResult;

      if (result !== null && this.#resultCurrent(result)) {
        content.element.style.setProperty("left", `${result.x}px`);
        content.element.style.setProperty("top", `${result.y}px`);
        this.#releaseOverrides(content.element);
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

  #observeAxes(): void {
    const activation = this.#activation;

    if (this.#destroyed || activation === null || !activation.parts.anchor.element.isConnected) {
      return;
    }

    const anchor = activation.parts.anchor.element;
    const style = anchor.ownerDocument.defaultView!.getComputedStyle(anchor);
    const axes = `${style.writingMode}/${style.direction}`;

    if (axes !== this.#axes) {
      this.#axes = axes;
      this.#invalidatePosition();
    }
  }

  #read(): void {
    if (this.#destroyed || this.#server) {
      return;
    }

    const activation = this.#activation;

    if (activation === null || !this.#trackingAllowed(activation)) {
      return;
    }

    this.#observeAxes();

    if (this.#stopTracking === null) {
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

    void positionContent(activation.parts.anchor.element, content.element, configuration).then(
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
    );
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

  #resultCurrent(result: PositionResult): boolean {
    return (
      this.#trackingAllowed(result.activation) &&
      this.intent() === result.intent &&
      this.#configuration() === result.configuration &&
      this.#positionRequest === result.request &&
      result.activation.parts.content.presentation.captureTransition() === result.transition
    );
  }

  #prepare(element: HTMLElement): void {
    if (this.#overrides.length === 0) {
      const opacityVariable = `--${this.#preparationId}-opacity`;
      const pointerVariable = `--${this.#preparationId}-pointer`;

      // Owner-private declarations block inherited values. Track them through the
      // same restoration protocol; their names are not application styling hooks.
      // Distinct specified tokens still compute to 0/none, so ordinary authored
      // 0!important / none!important cannot be mistaken for our own override.
      this.#overrides = [
        {
          property: opacityVariable,
          temporary: "0",
          value: element.style.getPropertyValue(opacityVariable),
          priority: element.style.getPropertyPriority(opacityVariable),
        },
        {
          property: pointerVariable,
          temporary: "none",
          value: element.style.getPropertyValue(pointerVariable),
          priority: element.style.getPropertyPriority(pointerVariable),
        },
        {
          property: "opacity",
          temporary: `var(${opacityVariable}, 0)`,
          value: element.style.getPropertyValue("opacity"),
          priority: element.style.getPropertyPriority("opacity"),
        },
        {
          property: "pointer-events",
          temporary: `var(${pointerVariable}, none)`,
          value: element.style.getPropertyValue("pointer-events"),
          priority: element.style.getPropertyPriority("pointer-events"),
        },
      ];
    }

    for (const override of this.#overrides) {
      const value = element.style.getPropertyValue(override.property);
      const priority = element.style.getPropertyPriority(override.property);

      if (value !== override.temporary || priority !== "important") {
        override.value = value;
        override.priority = priority;
      }

      element.style.setProperty(override.property, override.temporary, "important");
      // Ownership compares the browser's specified serialization, never computed values.
      override.temporary = element.style.getPropertyValue(override.property);
    }
  }

  #releaseOverrides(element: HTMLElement): void {
    // Restore visual declarations before releasing their private variable dependencies.
    for (let index = this.#overrides.length - 1; index >= 0; index--) {
      const override = this.#overrides[index];

      // A consumer binding written after our override is authoritative. Otherwise
      // restore the latest binding captured in preparation, including its priority.
      if (
        element.style.getPropertyValue(override.property) === override.temporary &&
        element.style.getPropertyPriority(override.property) === "important"
      ) {
        if (override.value === "") {
          element.style.removeProperty(override.property);
        } else {
          element.style.setProperty(override.property, override.value, override.priority);
        }
      }
    }

    this.#overrides = [];
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
    this.#releaseOverrides(activation.parts.content.element);
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
