import {
  DestroyRef,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";

/** Substitutable Trigger identity and disabled policy. */
export abstract class OrigamiDialogTriggerOptions {
  /** Effective reactive DOM ID. Generated identity is only the direct directive's default. */
  abstract readonly id: Signal<string>;
  /**
   * Blocks this Trigger's user activation, direct default false. Writes to the root's `open`
   * still open the Dialog, and focus is never returned to a disabled Trigger.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Trigger is disabled it stays focusable: `aria-disabled="true"` and `data-disabled`
   * without native `disabled`. Activation stays blocked, but the button's own `(click)` listeners
   * still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Substitutes the entire Trigger configuration.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDialogTriggerOptions> | AbstractType<OrigamiDialogTriggerOptions>,
  ): Provider {
    return { provide: OrigamiDialogTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Trigger configuration, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`, `disabled` and
   *   `focusableWhenDisabled`.
   * @returns A local provider, not a merge with unused defaults.
   */
  static provideFactory(factory: () => OrigamiDialogTriggerOptions): Provider {
    return { provide: OrigamiDialogTriggerOptions, useFactory: factory };
  }
}

/**
 * Optional button that opens its Dialog: native button activation writes the root's `open` true.
 * A Dialog opened from anywhere else, such as an ordinary button writing the model, needs none.
 * `type="button"` prevents form submission. While disabled by its own Options, its composed
 * `ogButton` sets `aria-disabled="true"`, `data-disabled` and native `disabled` unless
 * `focusableWhenDisabled`, and activation is ignored. Don't apply another button primitive to
 * the same button. Requires a nearest Dialog; a second mounted Trigger fails clearly.
 *
 * `aria-expanded` is the root's requested state and `aria-controls` names mounted Content. When
 * the dialog closes and focus would otherwise be left on the document body or inside the closed
 * dialog, focus returns to this Trigger if it's still connected, enabled and not inert.
 */
@Directive({
  selector: "button[ogDialogTrigger]",
  exportAs: "ogDialogTrigger",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiDialogTriggerOptions.provideExisting(() => OrigamiDialogTrigger),
    OrigamiButtonOptions.provideFactory(() => {
      const trigger = inject(OrigamiDialogTriggerOptions);

      return {
        disabled: trigger.disabled,
        focusableWhenDisabled: trigger.focusableWhenDisabled,
      };
    }),
  ],
  host: {
    "[id]": "effectiveId()",
    "[attr.aria-expanded]": "expanded()",
    "[attr.aria-controls]": "contentId()",
    "(click)": "activate()",
  },
})
export class OrigamiDialogTrigger implements OrigamiDialogTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("dialog-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiDialogTriggerOptions);
  readonly #context = inject(DialogContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Effective host identity from the resolved Options token. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal The root's requested state. */
  protected readonly expanded = this.#context.desired;
  /** @internal Mounted-only Content association. */
  protected readonly contentId = this.#context.contentId;

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
    if (!this.#destroyed && !this.#options().disabled()) {
      this.#context.setOpen(true);
    }
  }
}
