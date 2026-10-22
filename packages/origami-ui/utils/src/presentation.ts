import { InjectionToken } from "@angular/core";

/**
 * @internal A native presentation as its dismissal layer and its presentation children read it.
 * `ɵOrigamiFloating` implements it for Popover and Tooltip Content, and Dialog Content's modal
 * session for Dialog.
 */
export interface ɵOrigamiPresentation {
  /** Stacking order of the current activation, -1 without one. */
  order(): number;
  /**
   * The current activation, compared by identity in branch snapshots. It keeps its identity through
   * an accepted user close until the presentation ends.
   */
  activation(): object | null;
  /**
   * Increments by exactly one each time readiness flips, and at no other time. A presentation child
   * folds it into its attempt revision. The layer's close check relies on it: when the owner's
   * `closeFromInteraction` closes a ready presentation, readiness is false (one increment) before it
   * returns.
   */
  epoch(): number;
  /** Revealed and positioned; a presentation child activates only after it. Tracked. */
  ready(): boolean;
  /**
   * Eligible for layer arbitration: a candidate for Escape and outside gestures, ordered by `order()`.
   * A presentation that still blocks the page after its intent closes, such as a modal session
   * running its exit, may keep participating so no layer beneath it receives those events.
   */
  isParticipating(): boolean;
  /** Not destroyed, intent open and every presentation ancestor requested. Tracked. */
  requested(): boolean;
  /**
   * Whether a presentation child may present inside it now: requested, its own conditions met and
   * its ancestors presenting. A child checks `ready()` separately.
   */
  canPresent(): boolean;
  /** Closed but still revealed while its Content's Presence runs the exit. */
  retainingExit(): boolean;
  /** Adds a presentation child it suppresses when it closes or is suppressed. */
  addChild(child: ɵOrigamiPresentationChild): void;
  removeChild(child: ɵOrigamiPresentationChild): void;
}

/** @internal What a presentation reads from a presentation child it keeps. */
export interface ɵOrigamiPresentationChild {
  /** Whether the child's owner requests it open. */
  desired(): boolean;
  /** Hides without exit retention and keeps intent; its own children are suppressed first. */
  suppress(): void;
  /** Called after the presentation committed a reveal, which can move the child's reference. */
  parentRevealed(): void;
}

/**
 * @internal The presentation of the Popover Content an owner sits inside, by DI. Popover Content
 * provides its owner's, so a Tooltip whose root is inside that Content presents only while that
 * Popover does. Popover never reads it: a nested Popover takes its parent from the parent
 * `PopoverContext`. Without either, a Popover or Tooltip presents under its modal scope's
 * presentation (`ɵOrigamiLayer.scope()`), a Dialog's modal session, found from the DOM.
 */
export const ɵOrigamiPresentationScope = new InjectionToken<ɵOrigamiPresentation>(
  "ɵOrigamiPresentationScope",
);
