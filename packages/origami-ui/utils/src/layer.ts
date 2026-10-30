import { DestroyRef, DOCUMENT, PLATFORM_ID, Service, inject, signal } from "@angular/core";
import type { Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import type { ɵOrigamiPresentation } from "./presentation";

/** @internal Identity-compared requested intent; a new object for each effective decision. */
export type ɵOrigamiIntent = { readonly open: boolean };

/** @internal What an owner supplies to its dismissal layer. Signals are read lazily, after construction. */
export interface ɵOrigamiLayerHost {
  readonly intent: Signal<ɵOrigamiIntent>;
  /** Owner facts a captured branch must still match, by identity (Popover: parts and policy). */
  readonly revision: Signal<object>;
  /** User-dismissal permission, captured in a branch snapshot for the veto preflight. */
  readonly dismissible: Signal<boolean>;
  /** Dismissal-branch parent by DI, the parent Popover's; a nested descendant counts as inside it. */
  readonly parent: ɵOrigamiLayer | null;
  /**
   * A modal owner's (Dialog Content's) `<dialog>`, null for a non-modal one. It registers as a
   * modal scope at construction. A modal owner defers an outside gesture to its branch: while a
   * branch descendant participates, the gesture dismisses only those and leaves it open. While it
   * is the newest participating modal owner, Escape and close requests consider only the layers
   * inside it.
   */
  readonly modal: Element | null;
  /**
   * Whether, without a `parent`, this layer joins the branch of its modal scope (`scope()`): it
   * counts as inside that Dialog, closes before it when its branch is dismissed, and the Dialog
   * defers a backdrop gesture to it while it participates. A Popover joins; a Tooltip and a
   * Dialog don't.
   */
  readonly joinsModalBranch: boolean;
  /** The owner's presentation: participation, order, activation, epoch and readiness. */
  readonly presentation: ɵOrigamiPresentation;
  /** Whether a composed-path node of the pointer `event` is inside one of this owner's own parts. */
  containsTarget(target: Node, event: PointerEvent): boolean;
  /**
   * Whether `focus`, the focused element itself (`ɵdeepActiveElement`), is inside this owner's own
   * Content in the flat tree.
   */
  containsFocus(focus: Element): boolean;
  /** This owner's registered part elements; its modal scope must contain every one of them. */
  elements(): readonly Element[];
  /** Writes intent closed for an accepted user dismissal. */
  closeFromInteraction(): void;
  /**
   * Restores focus after an accepted Escape or Trigger dismissal of the branch this owner owns,
   * unless the focused element itself (`ɵdeepActiveElement`) is no longer `expectedFocus`.
   */
  restoreFocus(expectedFocus: Element | null): void;
}

type BranchMember = {
  readonly layer: ɵOrigamiLayer;
  intent: ɵOrigamiIntent;
  readonly revision: object;
  readonly dismissible: boolean;
  readonly children: ReadonlySet<ɵOrigamiLayer>;
  readonly activation: object | null;
  presentationEpoch: number;
  readonly ready: boolean;
};
type Branch = { readonly owner: ɵOrigamiLayer; readonly members: BranchMember[] };
type Gesture = { readonly event: PointerEvent; readonly branches: Branch[]; cancelled: boolean };

/**
 * @internal One owner's participation in Escape order and outside-pointer dismissal. An owner
 * constructs it in its injection context after its presentation and calls `destroy()` from its
 * own teardown, before the presentation's.
 */
export class ɵOrigamiLayer {
  readonly parent: ɵOrigamiLayer | null;
  /** The application document `ɵOrigamiLayers` listens on and snapshots focus from. */
  readonly document: Document;
  /** The owner's presentation, which a layer whose modal scope this is presents under. */
  readonly presentation: ɵOrigamiPresentation;
  readonly #host: ɵOrigamiLayerHost;
  readonly #layers = inject(ɵOrigamiLayers);
  // Branch children by DI. Replaced on every change, never mutated: a branch snapshot compares it by identity.
  readonly #children = signal<ReadonlySet<ɵOrigamiLayer>>(new Set());
  // A modal owner's computed branch members, replaced only when they change, for the same comparison.
  #members: ReadonlySet<ɵOrigamiLayer> = new Set();
  #destroyed = false;

  constructor(host: ɵOrigamiLayerHost) {
    this.#host = host;
    this.parent = host.parent;
    this.presentation = host.presentation;
    this.document = this.#layers.document;
    this.#layers.register(this);

    if (this.parent !== null) {
      this.parent.#children.update((children) => new Set(children).add(this));
    }
  }

  /** Called first in the owner's teardown: unregisters and leaves the branch parent. */
  destroy(): void {
    this.#destroyed = true;
    this.#layers.unregister(this);

    if (this.parent !== null) {
      this.parent.#children.update((children) => {
        const remaining = new Set(children);

        remaining.delete(this);

        return remaining;
      });
    }
  }

  intent(): ɵOrigamiIntent {
    return this.#host.intent();
  }

  /** Allocates the stacking order for the owner's presentation. */
  nextOrder(): number {
    return this.#layers.nextOrder();
  }

  /** Dismisses this layer's current branch, unless a requested-open member vetoes it. */
  dismiss(reason: "escape" | "outside" | "trigger", bypassOwner: boolean): void {
    this.#layers.dismiss(this.captureBranch(), reason, bypassOwner);
  }

  /**
   * Closes this layer's current branch from inside it, as an activated menu item closes its menu
   * tree: runs `focus`, the one focus move, then, while the branch captured before it is still
   * current and its owner requested open, writes every requested-open member closed, descendants
   * before ancestor, as an accepted dismissal does. Nothing vetoes it and nothing restores focus
   * afterwards.
   */
  closeBranch(focus: () => void): void {
    this.#layers.closeBranch(this.captureBranch(), focus);
  }

  /**
   * Escape's rule, the same one the document Escape handler applies: dismisses the branch of the
   * application's most recently ordered participating layer, unless a requested-open member
   * vetoes it. For a close request Escape doesn't dispatch, such as Dialog's native `cancel`.
   */
  dismissTopmost(): void {
    this.#layers.dismissTopmost();
  }

  captureBranch(): Branch {
    const members: BranchMember[] = [];
    const visit = (layer: ɵOrigamiLayer) => {
      const children = layer.#branchChildren();

      for (const child of children) {
        visit(child);
      }

      members.push({
        layer,
        intent: layer.#host.intent(),
        revision: layer.#host.revision(),
        dismissible: layer.#host.dismissible(),
        children,
        activation: layer.#host.presentation.activation(),
        presentationEpoch: layer.#host.presentation.epoch(),
        ready: layer.#host.presentation.ready(),
      });
    };

    visit(this);

    return { owner: this, members };
  }

  matches(member: BranchMember): boolean {
    return (
      !this.#destroyed &&
      this.#host.intent() === member.intent &&
      this.#host.revision() === member.revision &&
      this.#branchChildren() === member.children &&
      this.#host.presentation.activation() === member.activation &&
      this.#host.presentation.epoch() === member.presentationEpoch
    );
  }

  acceptCloseEpoch(member: BranchMember): boolean {
    let expectedEpoch = member.presentationEpoch;

    if (member.ready) {
      expectedEpoch += 1;
    }

    if (this.#host.presentation.epoch() !== expectedEpoch) {
      return false;
    }

    member.presentationEpoch = expectedEpoch;

    return true;
  }

  closeFromInteraction(): void {
    this.#host.closeFromInteraction();
  }

  restoreFocus(expectedFocus: Element | null): void {
    this.#host.restoreFocus(expectedFocus);
  }

  containsPath(path: EventTarget[], event: PointerEvent): boolean {
    for (const target of path) {
      if (target instanceof Node && this.#host.containsTarget(target, event)) {
        return true;
      }
    }

    for (const child of this.#branchChildren()) {
      if (child.containsPath(path, event)) {
        return true;
      }
    }

    return false;
  }

  /** A modal owner leaves an outside gesture to a participating branch descendant. */
  defersOutside(): boolean {
    if (this.#host.modal === null) {
      return false;
    }

    const participating = (layer: ɵOrigamiLayer): boolean => {
      for (const child of layer.#branchChildren()) {
        if (child.isParticipating() || participating(child)) {
          return true;
        }
      }

      return false;
    };

    return participating(this);
  }

  /**
   * Whether `focus`, the focused element itself, is inside this owner's Content or a branch
   * descendant's, in the flat tree.
   */
  containsFocus(focus: Element | null): boolean {
    if (focus === null) {
      return false;
    }

    if (this.#host.containsFocus(focus)) {
      return true;
    }

    for (const child of this.#branchChildren()) {
      if (child.containsFocus(focus)) {
        return true;
      }
    }

    return false;
  }

  order(): number {
    return this.#host.presentation.order();
  }

  branchOrder(): number {
    let order = this.order();

    for (const child of this.#branchChildren()) {
      order = Math.max(order, child.branchOrder());
    }

    return order;
  }

  isParticipating(): boolean {
    return this.#host.presentation.isParticipating();
  }

  isModal(): boolean {
    return this.#host.modal !== null;
  }

  /**
   * Whether this owner has a registered part and every one is inside the `<dialog>` of `modal`, a
   * modal owner, or is it, in the flat tree (`ɵflatTreeContains`).
   */
  isInside(modal: ɵOrigamiLayer): boolean {
    const dialog = modal.#host.modal;

    if (dialog === null) {
      return false;
    }

    const elements = this.#host.elements();

    if (elements.length === 0) {
      return false;
    }

    for (const element of elements) {
      if (!ɵflatTreeContains(dialog, element)) {
        return false;
      }
    }

    return true;
  }

  /**
   * The modal scope: the innermost registered modal owner, other than this one, whose `<dialog>`
   * contains every part of this owner in the flat tree, or null. Computed from the DOM at each
   * call, so read it when synchronizing or handling an event, never during render. Always null on
   * the server.
   */
  scope(): ɵOrigamiLayer | null {
    return this.#layers.scopeOf(this);
  }

  /** The DI parent, or for a layer that joins modal branches without one, its modal scope. */
  branchParent(): ɵOrigamiLayer | null {
    if (this.parent !== null || !this.#host.joinsModalBranch) {
      return this.parent;
    }

    return this.scope();
  }

  /** DI children, or for a modal owner the layers whose branch parent it is now. */
  #branchChildren(): ReadonlySet<ɵOrigamiLayer> {
    if (this.#host.modal === null) {
      return this.#children();
    }

    const members = this.#layers.membersOf(this);
    let changed = members.size !== this.#members.size;

    for (const member of members) {
      if (!this.#members.has(member)) {
        changed = true;

        break;
      }
    }

    if (changed) {
      this.#members = members;
    }

    return this.#members;
  }
}

/**
 * @internal Whether `node` is `ancestor` or one of its flat-tree descendants. The walk follows the
 * CSS flat-tree construction up from `node`: a slotted node goes to its assigned slot, a shadow
 * root to its host, and every other node to its parent, except that a shadow host's light-DOM
 * child no slot takes and a slot's fallback content while nodes are assigned to that slot aren't
 * in the flat tree, so the answer is false. Native modal inertness exempts only a `<dialog>`'s
 * flat-tree descendants, so a part in a component's shadow root inside it, or a light-DOM part
 * slotted into a shadow root's `<dialog>`, is inside it, and a part whose ancestor lost its slot
 * isn't.
 */
export function ɵflatTreeContains(ancestor: Node, node: Node): boolean {
  for (let current: Node | null = node; current !== null;) {
    if (current === ancestor) {
      return true;
    }

    const slot = assignedSlotOf(current);

    if (slot !== null) {
      current = slot;
      continue;
    }

    // Through the prototypes, like `assignedSlotOf`: a form's controls shadow its members by name.
    const parent: ParentNode | null = Reflect.get(Node.prototype, "parentNode", current);

    if (
      (parent instanceof Element && shadowRootOf(parent) !== null) ||
      (parent instanceof HTMLSlotElement &&
        HTMLSlotElement.prototype.assignedNodes.call(parent).length > 0)
    ) {
      return false;
    }

    if (parent instanceof ShadowRoot) {
      current = Reflect.get(ShadowRoot.prototype, "host", parent);
    } else {
      current = parent;
    }
  }

  return false;
}

/**
 * @internal The focused element itself, inside any open shadow roots, where the document's
 * `activeElement` is their host.
 */
export function ɵdeepActiveElement(document: Document): Element | null {
  // Through the prototypes, like the reads below: a document's named elements shadow its members.
  let active: Element | null = Reflect.get(Document.prototype, "activeElement", document);

  while (active !== null) {
    const shadow = shadowRootOf(active);

    if (shadow === null) {
      break;
    }

    const inner: Element | null = Reflect.get(ShadowRoot.prototype, "activeElement", shadow);

    if (inner === null) {
      break;
    }

    active = inner;
  }

  return active;
}

/**
 * The slot `node` is assigned to. Through the prototypes: a form's controls shadow its members by
 * name. Classified by `nodeType`, not `instanceof`, so a node another same-origin realm created
 * and this document adopted still counts.
 */
function assignedSlotOf(node: Node): HTMLSlotElement | null {
  const type: number = Reflect.get(Node.prototype, "nodeType", node);

  if (type === Node.ELEMENT_NODE) {
    return Reflect.get(Element.prototype, "assignedSlot", node);
  }

  if (type === Node.TEXT_NODE || type === Node.CDATA_SECTION_NODE) {
    return Reflect.get(Text.prototype, "assignedSlot", node);
  }

  return null;
}

/** `element`'s open shadow root, through the prototype, as `assignedSlotOf`. */
function shadowRootOf(element: Element): ShadowRoot | null {
  return Reflect.get(Element.prototype, "shadowRoot", element);
}

/** @internal Application-local event ownership, not a public overlay stack or global document singleton. */
@Service()
export class ɵOrigamiLayers {
  readonly document = inject(DOCUMENT);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #layers = new Set<ɵOrigamiLayer>();
  // The modal scopes: every registered modal owner, open or not.
  readonly #modals = new Set<ɵOrigamiLayer>();
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

      const topmost = this.#topmost();

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
      const candidates = new Set<ɵOrigamiLayer>();

      for (const layer of this.#layers) {
        if (layer.isParticipating() && !layer.containsPath(path, event)) {
          candidates.add(layer);
        }
      }

      // Decided before coverage, so the deferring owner's descendants form their own branches.
      for (const layer of [...candidates]) {
        if (layer.defersOutside()) {
          candidates.delete(layer);
        }
      }

      const branches: Branch[] = [];

      for (const layer of candidates) {
        let ancestor = layer.branchParent();
        let covered = false;

        while (ancestor !== null) {
          if (candidates.has(ancestor)) {
            covered = true;

            break;
          }

          ancestor = ancestor.branchParent();
        }

        if (!covered) {
          branches.push(layer.captureBranch());
        }
      }

      branches.sort((left, right) => right.owner.branchOrder() - left.owner.branchOrder());
      this.#gesture = { event, branches, cancelled: false };
    };
    const up = (event: PointerEvent) => {
      const gesture = this.#gesture;

      // UP ends acquisition. Normal capture release follows UP and must not veto it.
      // The task below still observes prevention by later listeners in this UP dispatch.
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
            this.#fresh(branch) &&
            branch.owner.isParticipating() &&
            !branch.owner.containsPath(path, event)
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

  register(layer: ɵOrigamiLayer): void {
    this.#layers.add(layer);

    if (layer.isModal()) {
      this.#modals.add(layer);
    }
  }

  unregister(layer: ɵOrigamiLayer): void {
    this.#layers.delete(layer);
    this.#modals.delete(layer);
  }

  /** See `ɵOrigamiLayer.scope`. */
  scopeOf(layer: ɵOrigamiLayer): ɵOrigamiLayer | null {
    if (this.#server) {
      return null;
    }

    let scope: ɵOrigamiLayer | null = null;

    // The modals containing a layer are flat-tree ancestors of one another: keep the innermost.
    for (const modal of this.#modals) {
      if (modal !== layer && layer.isInside(modal) && (scope === null || modal.isInside(scope))) {
        scope = modal;
      }
    }

    return scope;
  }

  /** A new set of the registered layers whose branch parent is `modal` now. */
  membersOf(modal: ɵOrigamiLayer): Set<ɵOrigamiLayer> {
    const members = new Set<ɵOrigamiLayer>();

    for (const layer of this.#layers) {
      if (layer.branchParent() === modal) {
        members.add(layer);
      }
    }

    return members;
  }

  nextOrder(): number {
    this.#nextOrder += 1;

    return this.#nextOrder;
  }

  /** Escape's rule outside a keydown: see `ɵOrigamiLayer.dismissTopmost`. */
  dismissTopmost(): void {
    const topmost = this.#topmost();

    if (topmost !== null) {
      this.dismiss(topmost.captureBranch(), "escape", false);
    }
  }

  /**
   * Escape's target: the most recently ordered participating layer, a Popover, Tooltip or Dialog.
   * While a modal Dialog participates, only the newest one and the layers inside it are eligible,
   * as the rest of the page is inert under it, even a layer opened later.
   */
  #topmost(): ɵOrigamiLayer | null {
    const modal = this.#newest((layer) => layer.isModal());

    return this.#newest((layer) => modal === null || layer.isInside(modal));
  }

  #newest(eligible: (layer: ɵOrigamiLayer) => boolean): ɵOrigamiLayer | null {
    let topmost: ɵOrigamiLayer | null = null;
    let order = -1;

    for (const layer of this.#layers) {
      if (layer.isParticipating() && eligible(layer) && layer.order() > order) {
        topmost = layer;
        order = layer.order();
      }
    }

    return topmost;
  }

  #fresh(branch: Branch): boolean {
    for (const member of branch.members) {
      if (!member.layer.matches(member)) {
        return false;
      }
    }

    return true;
  }

  dismiss(branch: Branch, reason: "escape" | "outside" | "trigger", bypassOwner: boolean): void {
    // A closed owner that still participates, a modal running its exit, consumes the request
    // without acting on it: its suppressed members keep their requested state.
    if (!this.#fresh(branch) || !branch.owner.intent().open) {
      return;
    }

    // Preflight every requested-open member before any model/output write.
    for (const member of branch.members) {
      if (
        member.intent.open &&
        !member.dismissible &&
        !(bypassOwner && member.layer === branch.owner)
      ) {
        return;
      }
    }

    const focus = ɵdeepActiveElement(this.document);

    if (!this.#close(branch)) {
      return;
    }

    if (
      reason !== "outside" &&
      ɵdeepActiveElement(this.document) === focus &&
      this.#fresh(branch)
    ) {
      branch.owner.restoreFocus(focus);
    }
  }

  /** See `ɵOrigamiLayer.closeBranch`. */
  closeBranch(branch: Branch, focus: () => void): void {
    focus();

    // Focus handlers ran inside: one may have closed, changed or destroyed a member.
    if (!this.#fresh(branch) || !branch.owner.intent().open) {
      return;
    }

    this.#close(branch);
  }

  /**
   * Writes every requested-open member of `branch` closed, descendants before ancestor, while it
   * stays the one captured; false once a listener changed it or kept a member open.
   */
  #close(branch: Branch): boolean {
    // The snapshot is already postorder: descendants before ancestor.
    for (const member of branch.members) {
      if (!this.#fresh(branch)) {
        return false;
      }

      if (!member.intent.open) {
        continue;
      }

      member.layer.closeFromInteraction();

      if (member.layer.intent().open) {
        return false;
      }

      member.intent = member.layer.intent();

      if (!member.layer.acceptCloseEpoch(member)) {
        return false;
      }

      if (!this.#fresh(branch)) {
        return false;
      }
    }

    return true;
  }
}
