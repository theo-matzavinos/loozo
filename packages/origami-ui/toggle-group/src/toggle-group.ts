import { DestroyRef, InjectionToken, Service, computed, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { ɵOrigamiRovingFocus, ɵOrigamiRovingFocusScope } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

/** Toggle Group axis: `horizontal` uses ArrowLeft/ArrowRight (reading-direction aware), `vertical` uses ArrowUp/ArrowDown. */
export type OrigamiToggleGroupOrientation = "horizontal" | "vertical";

/** Private mode-independent root configuration, aliased by each root to its own mode Options. */
export const groupConfiguration = new InjectionToken<{
  readonly disabled: Signal<boolean>;
  readonly orientation: Signal<OrigamiToggleGroupOrientation>;
}>("Toggle Group configuration");

export abstract class Selection {
  abstract selected(value: string): boolean;
  abstract request(value: string, pressed: boolean): void;
}

@Service({ autoProvided: false })
export class ToggleGroupContext {
  readonly #configuration = injectDeferred(groupConfiguration);
  readonly #selection = injectDeferred(Selection);
  readonly #scope = inject(ɵOrigamiRovingFocusScope, { optional: true });
  #destroyed = false;

  readonly disabled = computed(() => this.#configuration().disabled());
  /** Effective axis: the enclosing Toolbar's while joined, otherwise the group's own Options. */
  readonly orientation = computed(() => {
    if (this.#scope !== null) {
      return this.#scope.orientation();
    }

    return this.#configuration().orientation();
  });

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
    return this.#selection().selected(value);
  }

  /**
   * Registers the calling item, from its injection context, with the enclosing Toolbar's roving
   * focus, where it is never preferred, or otherwise with the group's own.
   */
  registerFocus(item: { readonly disabled: Signal<boolean>; readonly preferred: Signal<boolean> }) {
    if (this.#scope !== null) {
      return this.#scope.focus.join({ disabled: item.disabled, navigated: () => {} });
    }

    return inject(ɵOrigamiRovingFocus).register({ ...item, navigated: () => {} });
  }

  /** A user press request; the caller has already applied its own disabled policy. */
  request(value: string, pressed: boolean): void {
    if (!this.#destroyed && !this.disabled()) {
      this.#selection().request(value, pressed);
    }
  }
}

/** Locally provided readonly facade for the nearest Single or Multiple root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiToggleGroupState {
  readonly #context = inject(ToggleGroupContext);

  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** Effective arrow-key axis; inside a Toolbar, the Toolbar's. */
  readonly orientation: Signal<OrigamiToggleGroupOrientation> = this.#context.orientation;
}
