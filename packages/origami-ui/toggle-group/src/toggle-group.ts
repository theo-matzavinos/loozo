import { DestroyRef, Directive, Service, computed, inject } from "@angular/core";
import type { Provider, Signal } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import {
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";

/** Toggle Group axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiToggleGroupOrientation = "horizontal" | "vertical";

/** Configuration of `ɵOrigamiToggleGroupRoot`, supplied by the Single or Multiple root directive that composes it. */
export abstract class ToggleGroupRootOptions {
  /** Blocks every item's user activation. */
  abstract readonly disabled: Signal<boolean>;
  /** The effective arrow-key axis. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;
  /** The pressed values, in the root's own order. */
  abstract readonly values: Signal<readonly string[]>;
  /** Applies the mode's write rule to an item's press request. */
  abstract request(value: string, pressed: boolean): void;

  /**
   * Provides the root Options beside the composed root.
   * @param factory - Runs in the root's injection context the first time the root reads it.
   * @returns A one-provider local array.
   */
  static provideFactory(factory: () => ToggleGroupRootOptions): Provider[] {
    return [{ provide: ToggleGroupRootOptions, useFactory: factory }];
  }
}

@Service({ autoProvided: false })
export class ToggleGroupContext {
  readonly #options = injectDeferred(ToggleGroupRootOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  #destroyed = false;

  readonly disabled = computed(() => this.#options().disabled());
  readonly orientation = computed(() => this.#options().orientation());
  readonly values = computed(() => this.#options().values());
  /** Emits synchronously when focus leaves the root's element; only the Single and Multiple roots report it. */
  readonly touches = this.#touches.asObservable();

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  selected(value: string): boolean {
    return this.values().includes(value);
  }

  /**
   * A user press request; the caller has already applied its own disabled policy. Dropped while
   * disabled or while the `[formField]` on the root's element is readonly.
   */
  request(value: string, pressed: boolean): void {
    const formReadonly = this.#binding?.state().readonly() ?? false;

    if (!this.#destroyed && !this.disabled() && !formReadonly) {
      this.#options().request(value, pressed);
    }
  }

  /** Focus left the root's element. */
  left(): void {
    this.#touches.next();
  }
}

/** Locally provided readonly facade for the nearest Single or Multiple root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiToggleGroupState {
  readonly #context = inject(ToggleGroupContext);

  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** Effective arrow-key axis; for a Toolbar Toggle Group, the Toolbar's. */
  readonly orientation: Signal<OrigamiToggleGroupOrientation> = this.#context.orientation;
}

/**
 * The roving focus of a standalone Single or Multiple root: its own tab stop, held by the first
 * pressed item in DOM order, along the root's orientation. A Toolbar Toggle Group provides none,
 * so its items join the Toolbar's.
 */
export const ownRovingFocus: Provider[] = [
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions.provideFactory(() => {
    const context = inject(ToggleGroupContext);

    return { orientation: context.orientation, preferred: context.values };
  }),
];

/**
 * @internal Package-private shared Toggle Group root, composed by the Single and Multiple roots
 * and the Toolbar Toggle Groups, configured by the root Options their mode Options supply. It provides the
 * Context and State its items read. Static `role="group"` (a consumer's static `role` overrides
 * it), `data-orientation` and `data-disabled` reflect effective Options; there is no
 * `aria-orientation`, which ARIA does not allow on `group`. Not an application API.
 */
@Directive({
  providers: [ToggleGroupContext, OrigamiToggleGroupState],
  host: {
    role: "group",
    "[attr.data-orientation]": "orientation()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class ɵOrigamiToggleGroupRoot {
  readonly #context = inject(ToggleGroupContext);

  /** @internal Effective orientation host marker. */
  protected readonly orientation = this.#context.orientation;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
}
