import { Service } from "@angular/core";
import type { TooltipIntent } from "./tooltip-intent";

/** How long the group stays warm after its current Tooltip closes, in milliseconds. */
const warmWindow = 300;

/**
 * @internal The delay group of every Tooltip in one Angular application. Only hover and focus
 * intent writes to it, so application writes neither join nor are affected by it. The warm
 * window is a deadline, not a timer: nothing is pending when a member or the application is
 * destroyed, and the server never writes it.
 */
@Service()
export class TooltipGroup {
  /**
   * The member whose hover or focus open was the latest such open, while it may still own it. The
   * group drops it at its next read once it doesn't, warming unless an application open replaced it.
   */
  #current: TooltipIntent | null = null;
  #coolsAt = Number.NEGATIVE_INFINITY;
  /** The member whose grace transit is active. */
  #transit: TooltipIntent | null = null;
  /** Hovered members whose open waits for another member's transit to end. */
  readonly #waiting = new Set<TooltipIntent>();

  /** While a hover- or focus-opened Tooltip is open, and for 300 ms after it closes. */
  warm(): boolean {
    return this.#owner() !== null || performance.now() < this.#coolsAt;
  }

  /** Whether another member's grace transit is active, so `member`'s hover open waits. */
  inTransit(member: TooltipIntent): boolean {
    return this.#transit !== null && this.#transit !== member;
  }

  /**
   * `member` has written its hover or focus open: it becomes current first, then the previous
   * current Tooltip closes through its own write. A newer current that the previous close's output
   * establishes stays current.
   */
  opening(member: TooltipIntent): void {
    const previous = this.#owner();

    this.#current = member;

    if (previous !== null && previous !== member) {
      previous.close();
    }
  }

  /**
   * A close of `member` was observed. A still-current member is dropped: `own` (the close replaced
   * its own open) warms the group; otherwise an application decision replaced that open first, and
   * the group drops it without warming.
   */
  closed(member: TooltipIntent, own: boolean): void {
    if (this.#current !== member) {
      return;
    }

    if (own) {
      this.#cool();
    } else {
      this.#current = null;
    }
  }

  wait(member: TooltipIntent): void {
    this.#waiting.add(member);
  }

  stopWaiting(member: TooltipIntent): void {
    this.#waiting.delete(member);
  }

  transitStarted(member: TooltipIntent): void {
    this.#transit = member;
  }

  /**
   * The transit's member saw the pointer leave the area: each member still waiting runs its hover
   * open again. A transit blocks every other hover open, so there is never a second one.
   */
  transitLeft(): void {
    this.#transit = null;

    // A member that leaves or is destroyed during a resumed open is no longer visited.
    for (const waiting of this.#waiting) {
      this.#waiting.delete(waiting);
      waiting.resumeHover();
    }
  }

  /** The transit's member ended it any other way: the members waiting for it don't open. */
  transitEnded(): void {
    this.#transit = null;
    this.#waiting.clear();
  }

  /**
   * A destroyed member: the group drops it; destroying the current Tooltip starts the window,
   * unless the application has since opened it. A close that its own output destroys isn't
   * observed, so the member's effective decision answers it.
   */
  leave(member: TooltipIntent): void {
    this.#waiting.delete(member);

    // Another current member stays: its close, which may be in progress, warms the group.
    if (this.#current !== member) {
      return;
    }

    this.#drop(member);
  }

  /**
   * The current member while its own open is still the effective decision. Once it isn't, the
   * group drops it here, also when a close isn't observed yet; that close's later `closed()` finds
   * it no longer current.
   */
  #owner(): TooltipIntent | null {
    const current = this.#current;

    if (current !== null && !current.ownsOpen()) {
      this.#drop(current);
    }

    return this.#current;
  }

  /** The current member no longer owns its open: it closed, unless an application open replaced it. */
  #drop(current: TooltipIntent): void {
    if (current.applicationOpened()) {
      this.#current = null;
    } else {
      this.#cool();
    }
  }

  #cool(): void {
    this.#current = null;
    this.#coolsAt = performance.now() + warmWindow;
  }
}
