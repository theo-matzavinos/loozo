import { DestroyRef, DOCUMENT, PLATFORM_ID, Service, inject } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import type { ɵOrigamiIntent } from "./floating";
import type { Parts, Policy, PopoverContext } from "./popover";

export type BranchMember = {
  readonly context: PopoverContext;
  intent: ɵOrigamiIntent;
  readonly parts: Parts;
  readonly policy: Policy;
  readonly children: ReadonlySet<PopoverContext>;
  readonly activation: object | null;
  presentationEpoch: number;
  readonly ready: boolean;
};
export type Branch = { readonly owner: PopoverContext; readonly members: BranchMember[] };
type Gesture = { readonly event: PointerEvent; readonly branches: Branch[]; cancelled: boolean };

// Application-local event ownership, not a public overlay stack or global document singleton.
@Service()
export class PopoverParticipants {
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
