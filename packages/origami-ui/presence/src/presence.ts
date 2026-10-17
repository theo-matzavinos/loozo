import {
  DestroyRef,
  Directive,
  ElementRef,
  PLATFORM_ID,
  Service,
  afterEveryRender,
  computed,
  forwardRef,
  inject,
  linkedSignal,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ɵOrigamiPresencePresentation } from "./presence-presentation";
import type { ɵOrigamiPresenceTransition } from "./presence-presentation";

/** The desired-presence transition phase; `closing` still retains consumer children. */
export type OrigamiPresencePhase = "opening" | "open" | "closing" | "closed";

/** Substitutable Presence configuration, resolved after the owning directive is constructed. */
export abstract class OrigamiPresenceOptions {
  /** Desired presence. The direct directive's model defaults to false. */
  abstract readonly present: Signal<boolean>;

  /**
   * Replaces all effective Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPresenceOptions> | AbstractType<OrigamiPresenceOptions>,
  ): Provider {
    return { provide: OrigamiPresenceOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces effective Options with a structurally compatible factory result.
   * @param factory - Runs in Angular injection context. All required fields must be supplied.
   * @returns A local provider. Replacement signals do not emit unused directive-model outputs.
   */
  static provideFactory(factory: () => OrigamiPresenceOptions): Provider {
    return { provide: OrigamiPresenceOptions, useFactory: factory };
  }
}

type PresenceCompletion = {
  readonly transition: ɵOrigamiPresenceTransition;
  readonly presentationLifetime: number;
};

@Service({ autoProvided: false })
class PresenceContext {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #options = injectDeferred(OrigamiPresenceOptions);
  readonly #presentation = inject(ɵOrigamiPresencePresentation, { optional: true, self: true });
  readonly #initiallyPresent = this.#host.hasAttribute("data-present");
  /** Matches no pending work once set; captured transitions after destruction return it. */
  #ended: ɵOrigamiPresenceTransition | null = null;
  #discovered: PresenceCompletion | null = null;
  #destroyed = false;

  /**
   * The current transition toward desired presence. Each new transition is a new object, so its
   * identity tells pending discovery, completion and Popover's reveal gate whether they still
   * belong to it. Settling doesn't replace it; a desired presence that ends up unchanged before
   * it's read isn't a new transition.
   */
  readonly #transition = linkedSignal<boolean, ɵOrigamiPresenceTransition>({
    source: () => this.#options().present(),
    computation: (present, previous) => {
      if (previous !== undefined && previous.value.present === present) {
        return previous.value;
      }

      return { present };
    },
  });

  /** Whether the current transition has finished; a new transition starts unsettled. */
  readonly #settled = linkedSignal<ɵOrigamiPresenceTransition, boolean>({
    source: this.#transition,
    computation: (transition, previous) => {
      if (this.#server) {
        return true;
      }

      if (previous !== undefined) {
        return false;
      }

      // A reused `data-present` host attaches settled open, without a hydration-only entrance.
      return transition.present === this.#initiallyPresent;
    },
  });

  readonly phase = computed<OrigamiPresencePhase>(() => {
    const present = this.#transition().present;

    if (this.#settled()) {
      if (present) {
        return "open";
      }

      return "closed";
    }

    if (present) {
      return "opening";
    }

    return "closing";
  });

  readonly entering = computed(() => {
    if (this.phase() !== "opening") {
      return null;
    }

    if (this.#presentation !== null && !this.#presentation.enteringAllowed(this.#transition())) {
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
    this.#presentation?.attach(() => this.#ended ?? this.#transition());

    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#ended = { present: false };
    });

    afterEveryRender({
      write: () => {
        if (this.#destroyed) {
          return null;
        }

        if (this.#settled()) {
          return null;
        }

        // Host attributes and retained children have been rendered. This explicit
        // WRITE barrier is observed only by the paired READ, after every owner's WRITE.
        return {
          transition: this.#transition(),
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

    return (
      this.#transition() === completion.transition &&
      (this.#presentation?.captureLifetime() ?? 0) === completion.presentationLifetime
    );
  }

  #finish(completion: PresenceCompletion): void {
    if (!this.#isCurrent(completion)) {
      return;
    }

    this.#settled.set(true);
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
  readonly phase: Signal<OrigamiPresencePhase> = this.#context.phase;

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
    OrigamiPresenceOptions.provideExisting(() => OrigamiPresence),
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
