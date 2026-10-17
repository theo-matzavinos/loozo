import { Service, signal } from "@angular/core";

/**
 * @internal One Presence transition toward a desired presence. Presence creates a new object for
 * each new transition and keeps it when the transition settles, so it's compared only by identity.
 */
export interface ɵOrigamiPresenceTransition {
  readonly present: boolean;
}

/**
 * @internal Popover-only coordination of retained Presence with native presentation.
 * Not a supported application API or general presentation extension point.
 *
 * Provide this class locally on the Content host alongside composed Presence. Capture
 * a transition after host bindings/children have rendered. Permit its entering attribute
 * when the matching coordinate result is available; commit reveal in a subsequent WRITE.
 * Presence discovery runs in READ after all WRITEs, and requires that exact reveal commit.
 * Visible closing discovery uses its own leaving WRITE, not another geometry result.
 */
@Service({ autoProvided: false })
export class ɵOrigamiPresencePresentation {
  #readTransition: (() => ɵOrigamiPresenceTransition) | null = null;
  readonly #enteringTransition = signal<ɵOrigamiPresenceTransition | null>(null);
  #revealedTransition: ɵOrigamiPresenceTransition | null = null;
  readonly #visual = signal(false);
  #lifetime = 0;

  /** @internal Called only by the local Presence owner to attach transition capture. */
  attach(readTransition: () => ɵOrigamiPresenceTransition): void {
    this.#readTransition = readTransition;
  }

  /** @internal Captures the current Presence transition, reconciling current Options first. */
  captureTransition(): ɵOrigamiPresenceTransition {
    if (this.#readTransition === null) {
      throw new Error("Popover presentation has no local Presence owner.");
    }

    return this.#readTransition();
  }

  /** @internal Permits `data-entering` in the render containing the matching reveal WRITE. */
  permitEnter(transition: ɵOrigamiPresenceTransition): void {
    if (transition === this.captureTransition()) {
      this.#enteringTransition.set(transition);
    }
  }

  /**
   * @internal Called after the current native activation's coordinate/reveal WRITE.
   * Reusing a visible exit requires a fresh permit/commit for the new Presence transition,
   * but must not require another native activation. Ordinary position updates need not call this.
   */
  commitReveal(transition: ɵOrigamiPresenceTransition): void {
    if (transition === this.captureTransition()) {
      this.#revealedTransition = transition;
      this.#visual.set(true);
    }
  }

  /**
   * @internal Native presentation lifetime. Only reset increments this generation;
   * coordinate requests and scroll updates must not invalidate active animation waits.
   */
  captureLifetime(): number {
    return this.#lifetime;
  }

  /** @internal Whether the matching transition may bind its entering attribute. */
  enteringAllowed(transition: ɵOrigamiPresenceTransition): boolean {
    return this.#enteringTransition() === transition;
  }

  /** @internal Whether the matching entrance has committed its reveal WRITE. */
  revealCommitted(transition: ɵOrigamiPresenceTransition): boolean {
    return this.#revealedTransition === transition;
  }

  /** @internal Whether an actual revealed native host exists, including a retained visible exit. */
  visual(): boolean {
    return this.#visual();
  }

  /**
   * @internal Relinquishes visual readiness after native hiding, suppression or a nonvisual close.
   * Invalidates that activation's pending READ/completion, even when intent and the
   * Presence transition are unchanged. A subsequent reveal may rediscover that transition.
   * Call only for the still-current native owner; Presence never drives native show/hide or focus.
   */
  reset(): void {
    this.#lifetime += 1;
    this.#visual.set(false);
    this.#enteringTransition.set(null);
    this.#revealedTransition = null;
  }
}
