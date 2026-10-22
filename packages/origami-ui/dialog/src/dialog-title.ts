import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";

/** Effective Title identity, named by its Dialog's Content. */
export abstract class OrigamiDialogTitleOptions {
  /** Effective DOM ID; Content's `aria-labelledby` names it while the Title is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Title's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDialogTitleOptions> | AbstractType<OrigamiDialogTitleOptions>,
  ): Provider {
    return { provide: OrigamiDialogTitleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Title identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiDialogTitleOptions): Provider {
    return { provide: OrigamiDialogTitleOptions, useFactory: factory };
  }
}

/**
 * The dialog's accessible name, usually its heading. It binds its effective `id`, and Content's
 * `aria-labelledby` names it while it is mounted, with several Titles in the order they
 * registered. It registers once Angular has set its inputs, so a Title rendered by a child
 * component works too. Requires a nearest Dialog.
 *
 * @example
 * ```html
 * <h2 ogDialogTitle>Delete invoice?</h2>
 * ```
 */
@Directive({
  selector: "[ogDialogTitle]",
  providers: [OrigamiDialogTitleOptions.provideExisting(() => OrigamiDialogTitle)],
  host: { "[id]": "effectiveId()" },
})
export class OrigamiDialogTitle implements OrigamiDialogTitleOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("dialog-title"));

  readonly #options = injectDeferred(OrigamiDialogTitleOptions);
  readonly #context = inject(DialogContext);
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());

  /** @internal Joins its Dialog's Titles once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerTitle({ id: () => this.#options().id() }, this.#destroyRef);
  }
}
