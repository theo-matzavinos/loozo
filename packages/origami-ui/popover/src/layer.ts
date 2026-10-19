import { DestroyRef, DOCUMENT, PLATFORM_ID, Service, inject, signal } from "@angular/core";
import type { Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import type { ɵOrigamiFloating, ɵOrigamiIntent } from "./floating";

/** @internal What an owner supplies to its dismissal layer. Signals are read lazily, after construction. */
export interface ɵOrigamiLayerHost {
  readonly intent: Signal<ɵOrigamiIntent>;
  /** Owner facts a captured branch must still match, by identity (Popover: parts and policy). */
  readonly revision: Signal<object>;
  /** User-dismissal permission, captured in a branch snapshot for the veto preflight. */
  readonly dismissible: Signal<boolean>;
  /** Dismissal-branch parent; a nested descendant counts as inside it. */
  readonly parent: ɵOrigamiLayer | null;
  /** The owner's floating presentation: participation, order, activation, epoch and readiness. */
  readonly floating: ɵOrigamiFloating;
  /** Whether a composed-path node is inside one of this owner's own parts. */
  containsTarget(target: Node): boolean;
  /** Whether focus is inside this owner's own Content. */
  containsFocus(focus: Element): boolean;
  /** Writes intent closed for an accepted user dismissal, through `floating.closeFromInteraction`. */
  closeFromInteraction(): void;
  /** Restores focus after an accepted Escape or Trigger dismissal of the branch this owner owns. */
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
 * constructs it in its injection context after its floating piece and calls `destroy()` from its
 * own teardown, before the floating piece's.
 */
export class ɵOrigamiLayer {
  readonly parent: ɵOrigamiLayer | null;
  /** The application document `ɵOrigamiLayers` listens on and snapshots focus from. */
  readonly document: Document;
  readonly #host: ɵOrigamiLayerHost;
  readonly #layers = inject(ɵOrigamiLayers);
  // Branch children. Replaced on every change, never mutated: a branch snapshot compares it by identity.
  readonly #children = signal<ReadonlySet<ɵOrigamiLayer>>(new Set());
  #destroyed = false;

  constructor(host: ɵOrigamiLayerHost) {
    this.#host = host;
    this.parent = host.parent;
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

  /** Allocates the stacking order for the owner's floating piece. */
  nextOrder(): number {
    return this.#layers.nextOrder();
  }

  /** Dismisses this layer's current branch, unless a requested-open member vetoes it. */
  dismiss(reason: "escape" | "outside" | "trigger", bypassOwner: boolean): void {
    this.#layers.dismiss(this.captureBranch(), reason, bypassOwner);
  }

  captureBranch(): Branch {
    const members: BranchMember[] = [];
    const visit = (layer: ɵOrigamiLayer) => {
      const children = layer.#children();

      for (const child of children) {
        visit(child);
      }

      members.push({
        layer,
        intent: layer.#host.intent(),
        revision: layer.#host.revision(),
        dismissible: layer.#host.dismissible(),
        children,
        activation: layer.#host.floating.activation(),
        presentationEpoch: layer.#host.floating.epoch(),
        ready: layer.#host.floating.ready(),
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
      this.#children() === member.children &&
      this.#host.floating.activation() === member.activation &&
      this.#host.floating.epoch() === member.presentationEpoch
    );
  }

  acceptCloseEpoch(member: BranchMember): boolean {
    let expectedEpoch = member.presentationEpoch;

    if (member.ready) {
      expectedEpoch += 1;
    }

    if (this.#host.floating.epoch() !== expectedEpoch) {
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

  containsPath(path: EventTarget[]): boolean {
    for (const target of path) {
      if (target instanceof Node && this.#host.containsTarget(target)) {
        return true;
      }
    }

    for (const child of this.#children()) {
      if (child.containsPath(path)) {
        return true;
      }
    }

    return false;
  }

  /** Whether focus is inside this owner's Content or a branch descendant's. */
  containsFocus(focus: Element | null): boolean {
    if (focus === null) {
      return false;
    }

    if (this.#host.containsFocus(focus)) {
      return true;
    }

    for (const child of this.#children()) {
      if (child.containsFocus(focus)) {
        return true;
      }
    }

    return false;
  }

  order(): number {
    return this.#host.floating.order();
  }

  branchOrder(): number {
    let order = this.order();

    for (const child of this.#children()) {
      order = Math.max(order, child.branchOrder());
    }

    return order;
  }

  isParticipating(): boolean {
    return this.#host.floating.isParticipating();
  }
}

/** @internal Application-local event ownership, not a public overlay stack or global document singleton. */
@Service()
export class ɵOrigamiLayers {
  readonly document = inject(DOCUMENT);
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #layers = new Set<ɵOrigamiLayer>();
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

      let topmost: ɵOrigamiLayer | null = null;
      let order = -1;

      for (const layer of this.#layers) {
        if (layer.isParticipating() && layer.order() > order) {
          topmost = layer;
          order = layer.order();
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
      const candidates = new Set<ɵOrigamiLayer>();

      for (const layer of this.#layers) {
        if (layer.isParticipating() && !layer.containsPath(path)) {
          candidates.add(layer);
        }
      }

      const branches: Branch[] = [];

      for (const layer of candidates) {
        let ancestor = layer.parent;
        let covered = false;

        while (ancestor !== null) {
          if (candidates.has(ancestor)) {
            covered = true;

            break;
          }

          ancestor = ancestor.parent;
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

  register(layer: ɵOrigamiLayer): void {
    this.#layers.add(layer);
  }

  unregister(layer: ɵOrigamiLayer): void {
    this.#layers.delete(layer);
  }

  nextOrder(): number {
    this.#nextOrder += 1;

    return this.#nextOrder;
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
    if (!this.#fresh(branch)) {
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

    const focus = this.document.activeElement;

    // The snapshot is already postorder: descendants before ancestor.
    for (const member of branch.members) {
      if (!this.#fresh(branch)) {
        return;
      }

      if (!member.intent.open) {
        continue;
      }

      member.layer.closeFromInteraction();

      if (member.layer.intent().open) {
        return;
      }

      member.intent = member.layer.intent();

      if (!member.layer.acceptCloseEpoch(member)) {
        return;
      }

      if (!this.#fresh(branch)) {
        return;
      }
    }

    if (reason !== "outside" && this.document.activeElement === focus && this.#fresh(branch)) {
      branch.owner.restoreFocus(focus);
    }
  }
}
