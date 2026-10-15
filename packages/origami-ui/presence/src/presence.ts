import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  computed,
  forwardRef,
  inject,
  linkedSignal,
  model,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { injectDeferred } from "@loozo/origami-ui/utils";

/** The desired-presence transition phase; `closing` still retains consumer children. */
export type OrigamiPresencePhase = "opening" | "open" | "closing" | "closed";

const presenceReplacement = new InjectionToken<OrigamiPresenceOptions>("Presence replacement");

/** Substitutable Presence configuration, resolved after the owning directive is constructed. */
export abstract class OrigamiPresenceOptions {
  /** Desired presence. The direct directive's model defaults to false. */
  abstract readonly present: Signal<boolean>;

  /**
   * Replaces all effective Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns Local replacement and public-alias providers; direct co-matches cannot override the replacement with defaults.
   */
  static provideExisting(
    type: () => Type<OrigamiPresenceOptions> | AbstractType<OrigamiPresenceOptions>,
  ): Provider[] {
    return [
      { provide: presenceReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiPresenceOptions, useExisting: presenceReplacement },
    ];
  }

  /**
   * Replaces effective Options with a structurally compatible factory result.
   * @param factory - Runs in Angular injection context. All required fields must be supplied.
   * @returns Local replacement and public-alias providers. Replacement signals do not emit unused directive-model outputs.
   */
  static provideFactory(factory: () => OrigamiPresenceOptions): Provider[] {
    return [
      { provide: presenceReplacement, useFactory: factory },
      { provide: OrigamiPresenceOptions, useExisting: presenceReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiPresenceOptions> | AbstractType<OrigamiPresenceOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiPresenceOptions,
        useFactory: () => {
          const replacement = inject(presenceReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(forwardRef(type));
        },
      },
    ];
  }
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
  #readTransition: (() => number) | null = null;
  readonly #enteringTransition = signal<number | null>(null);
  #revealedTransition: number | null = null;
  readonly #visual = signal(false);
  #lifetime = 0;

  /** @internal Called only by the local Presence owner to attach transition capture. */
  attach(readTransition: () => number): void {
    this.#readTransition = readTransition;
  }

  /** @internal Captures the current Presence transition, reconciling current Options first. */
  captureTransition(): number {
    if (this.#readTransition === null) {
      throw new Error("Popover presentation has no local Presence owner.");
    }

    return this.#readTransition();
  }

  /** @internal Permits `data-entering` in the render containing the matching reveal WRITE. */
  permitEnter(transition: number): void {
    if (transition === this.captureTransition()) {
      this.#enteringTransition.set(transition);
    }
  }

  /**
   * @internal Called after the current native activation's coordinate/reveal WRITE.
   * Reusing a visible exit requires a fresh permit/commit for the new Presence transition,
   * but must not require another native activation. Ordinary position updates need not call this.
   */
  commitReveal(transition: number): void {
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
  enteringAllowed(transition: number): boolean {
    return this.#enteringTransition() === transition;
  }

  /** @internal Whether the matching entrance has committed its reveal WRITE. */
  revealCommitted(transition: number): boolean {
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

type PresenceCompletion = {
  readonly transition: number;
  readonly presentationLifetime: number;
};

@Service({ autoProvided: false })
class PresenceContext {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #options = injectDeferred(OrigamiPresenceOptions);
  readonly #presentation = inject(ɵOrigamiPresencePresentation, { optional: true, self: true });
  readonly #initiallyPresent = this.#host.hasAttribute("data-present");
  #transition = 0;
  #discovered: PresenceCompletion | null = null;
  #destroyed = false;

  readonly phase = linkedSignal<boolean, OrigamiPresencePhase>({
    source: () => this.#options().present(),
    computation: (present, previous) => {
      if (this.#server) {
        if (present) {
          return "open";
        }

        return "closed";
      }

      let prior: OrigamiPresencePhase = "closed";

      if (this.#initiallyPresent) {
        prior = "open";
      }

      if (previous !== undefined) {
        prior = previous.value;
      }

      if (present && prior === "open") {
        return "open";
      }

      if (!present && prior === "closed") {
        return "closed";
      }

      this.#transition += 1;

      if (present) {
        return "opening";
      }

      return "closing";
    },
  });

  readonly entering = computed(() => {
    if (this.phase() !== "opening") {
      return null;
    }

    if (this.#presentation !== null && !this.#presentation.enteringAllowed(this.#transition)) {
      return null;
    }

    return "";
  });

  readonly present = computed(() => {
    if (this.phase() === "open") {
      return "";
    }

    return null;
  });

  readonly leaving = computed(() => {
    if (this.phase() === "closing") {
      return "";
    }

    return null;
  });

  constructor() {
    this.#presentation?.attach(() => {
      if (!this.#destroyed) {
        this.phase();
      }

      return this.#transition;
    });

    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#transition += 1;
    });

    afterEveryRender({
      write: () => {
        if (this.#destroyed) {
          return null;
        }

        const phase = this.phase();

        if (phase !== "opening" && phase !== "closing") {
          return null;
        }

        // Host attributes and retained children have been rendered. This explicit
        // WRITE barrier is observed only by the paired READ, after every owner's WRITE.
        return {
          transition: this.#transition,
          presentationLifetime: this.#presentation?.captureLifetime() ?? 0,
        };
      },
      read: (written) => {
        if (written === null || !this.#isCurrent(written)) {
          return;
        }

        const phase = this.phase();

        if (this.#presentation !== null) {
          if (phase === "closing" && !this.#presentation.visual()) {
            this.#finish(written);

            return;
          }

          if (phase === "opening" && !this.#presentation.revealCommitted(written.transition)) {
            return;
          }
        }

        // A native/application callback in another WRITE can change intent after
        // host binding evaluation. Do not discover until the matching marker really
        // exists on this host in a render containing this transition's WRITE barrier.
        if (phase === "opening" && !this.#host.hasAttribute("data-entering")) {
          return;
        }

        if (phase === "closing" && !this.#host.hasAttribute("data-leaving")) {
          return;
        }

        if (
          this.#discovered?.transition === written.transition &&
          this.#discovered.presentationLifetime === written.presentationLifetime
        ) {
          return;
        }

        this.#discovered = written;

        const waits: Promise<Animation>[] = [];

        for (const animation of this.#host.getAnimations()) {
          const timing = animation.effect?.getComputedTiming();

          if (timing !== undefined && Number.isFinite(timing.endTime)) {
            waits.push(animation.finished);
          }
        }

        if (waits.length === 0) {
          this.#finish(written);

          return;
        }

        // Animation cancellation rejects `finished`; it still completes this wait.
        void Promise.allSettled(waits).then(() => this.#finish(written));
      },
    });
  }

  #isCurrent(completion: PresenceCompletion): boolean {
    if (this.#destroyed) {
      return false;
    }

    this.phase();

    return (
      this.#transition === completion.transition &&
      (this.#presentation?.captureLifetime() ?? 0) === completion.presentationLifetime
    );
  }

  #finish(completion: PresenceCompletion): void {
    if (!this.#isCurrent(completion)) {
      return;
    }

    if (this.phase() === "opening") {
      this.phase.set("open");

      return;
    }

    if (this.phase() === "closing") {
      this.phase.set("closed");
    }
  }
}

/**
 * Locally injectable, readonly observation of the nearest Presence owner.
 * Not application-provided; descendants of one owner share its facade.
 */
@Service({ autoProvided: false })
export class OrigamiPresenceState {
  readonly #context = inject(PresenceContext);

  /**
   * Current phase. SSR settles desired presence. Reused `data-present` hosts attach
   * settled open without a hydration-only entrance. Reversal invalidates older completion.
   * Popover's preparatory opening can precede its entering attribute until reveal readiness;
   * release of a native activation invalidates its pending completion independently of position updates.
   */
  readonly phase: Signal<OrigamiPresencePhase> = this.#context.phase.asReadonly();

  /** True during opening, open and closing; false only once closed. Never writable by consumers. */
  readonly open: Signal<boolean> = computed(() => this.phase() !== "closed");
}

/**
 * Observes presence without hiding, moving or removing its host.
 * Consumers may gate children with `state.open()` to retain them through finite exit.
 * Host markers are `data-entering`, `data-present`, `data-leaving`, empty only in their
 * respective phases. These markers are reserved, not consumer-authored initialization
 * controls.
 *
 * Host animations are discovered after the transition's host bindings, rendered children
 * and presentation/visibility writes have taken effect. Finite host animations settle on
 * completion or cancellation; infinite animations are ignored, including when finite peers
 * exist. No animations or zero-duration animations settle without a guessed-duration timer.
 * Reversal or destruction invalidates pending discovery and completion. Consumer CSS owns
 * motion and reduced-motion behavior. SSR settles desired presence without animation APIs;
 * initially-present gated children are retained through eager or deferred hydration without
 * a hydration-only entrance. Render callbacks do not constitute a hydration barrier.
 *
 * @example
 * ```html
 * <div ogPresence #presence="ogPresence" [(present)]="visible">
 *   @if (presence.state.open()) { <p>Retained through exit</p> }
 * </div>
 * ```
 */
@Directive({
  selector: "[ogPresence]",
  exportAs: "ogPresence",
  providers: [
    PresenceContext,
    OrigamiPresenceState,
    OrigamiPresenceOptions.ɵprovideDefault(() => OrigamiPresence),
  ],
  host: {
    "[attr.data-entering]": "entering()",
    "[attr.data-present]": "presentAttribute()",
    "[attr.data-leaving]": "leaving()",
  },
})
export class OrigamiPresence implements OrigamiPresenceOptions {
  /**
   * Own desired-presence model, default false; `presentChange` emits writes to this model.
   * Replaced Options supply effective intent instead and do not fabricate this output.
   */
  readonly present = model(false);

  /** Local readonly phase/retention observation; effective replaced Options drive this facade. */
  readonly state = inject(OrigamiPresenceState);

  readonly #context = inject(PresenceContext);

  /** @internal Readonly entering marker for host bindings. */
  protected readonly entering = this.#context.entering;
  /** @internal Readonly settled-present marker for host bindings. */
  protected readonly presentAttribute = this.#context.present;
  /** @internal Readonly leaving marker for host bindings. */
  protected readonly leaving = this.#context.leaving;
}
