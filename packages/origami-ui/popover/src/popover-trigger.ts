import {
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { PopoverContext } from "./popover";

/** Substitutable Trigger identity; also authoritative when Trigger and Anchor share one element. */
export abstract class OrigamiPopoverTriggerOptions {
  /** Effective reactive DOM ID. Generated identity is only the direct directive's default. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the entire Trigger configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPopoverTriggerOptions> | AbstractType<OrigamiPopoverTriggerOptions>,
  ): Provider {
    return { provide: OrigamiPopoverTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Trigger Options configuration, supplying `id`, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`.
   * @returns A local provider, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiPopoverTriggerOptions): Provider {
    return { provide: OrigamiPopoverTriggerOptions, useFactory: factory };
  }
}

/**
 * Native button activation toggles effective intent. `type="button"` prevents form submission;
 * Enter/Space remain native. Requires a nearest Popover owner; duplicate Trigger roles fail.
 * `aria-controls` names only mounted Content and updates with its effective ID.
 * `aria-expanded` observes actual native participation, not requested intent or visible exit.
 * Own Trigger close bypasses its own dismissal veto, never a protected descendant's.
 */
@Directive({
  selector: "button[ogPopoverTrigger]",
  providers: [OrigamiPopoverTriggerOptions.provideExisting(() => OrigamiPopoverTrigger)],
  host: {
    type: "button",
    "[id]": "effectiveId()",
    "[disabled]": "disabled()",
    "[attr.aria-expanded]": "participating()",
    "[attr.aria-controls]": "contentId()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
  },
})
export class OrigamiPopoverTrigger implements OrigamiPopoverTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Static/bound IDs drive default Options; replacements supply the effective ID. */
  readonly id = input(injectUniqueId("popover-trigger"));
  readonly #options = injectDeferred(OrigamiPopoverTriggerOptions);
  readonly #context = inject(PopoverContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Effective host identity from the resolved Options token. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Native disabled binding. */
  protected readonly disabled = this.#context.disabled;
  /** @internal Native participation, including transparent preparation but excluding exit. */
  protected readonly participating = this.#context.participating;
  /** @internal Mounted-only Content association. */
  protected readonly contentId = this.#context.contentId;
  /** @internal Disabled ARIA marker. */
  protected readonly disabledAria = computed(() => {
    if (this.disabled()) {
      return "true";
    }

    return null;
  });
  /** @internal Disabled data marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this Trigger once Angular has set its inputs; a second mounted Trigger fails clearly. */
  ngOnInit(): void {
    this.#context.registerTrigger(
      { element: this.#element, options: this.#options },
      this.#destroyRef,
    );
  }

  /** @internal Live native activation; disabled user input cannot write intent. */
  protected activate(): void {
    if (!this.#destroyed) {
      this.#context.activateTrigger();
    }
  }
}
