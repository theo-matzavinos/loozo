import {
  DestroyRef,
  Directive,
  Service,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";

type DescriptionPart = { readonly id: () => string };

/**
 * @internal The Descriptions of one Dialog Content, provided on it. Content names their IDs
 * through its one shared-description registration; only Descriptions of its own root join.
 */
@Service({ autoProvided: false })
export class DialogDescriptions {
  /** The root this Content belongs to. */
  readonly context = inject(DialogContext);
  readonly #parts = signal<readonly DescriptionPart[]>([]);
  /** Registered Description IDs in registration order. */
  readonly ids = computed(() => {
    const ids: string[] = [];

    for (const part of this.#parts()) {
      ids.push(part.id());
    }

    return ids;
  });

  /** Adds a Description's ID after those already registered, from its `ngOnInit`; `destroyRef` removes it. */
  register(part: DescriptionPart, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#parts.update((parts) => [...parts, part]);
    destroyRef.onDestroy(() => {
      const remaining: DescriptionPart[] = [];

      for (const mounted of this.#parts()) {
        if (mounted !== part) {
          remaining.push(mounted);
        }
      }

      this.#parts.set(remaining);
    });
  }
}

/** Effective Description identity, named by its Dialog's Content. */
export abstract class OrigamiDialogDescriptionOptions {
  /** Effective DOM ID; Content's `aria-describedby` names it while the Description is mounted. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Description's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiDialogDescriptionOptions>
      | AbstractType<OrigamiDialogDescriptionOptions>,
  ): Provider {
    return { provide: OrigamiDialogDescriptionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Description identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiDialogDescriptionOptions): Provider {
    return { provide: OrigamiDialogDescriptionOptions, useFactory: factory };
  }
}

/**
 * Text that describes the dialog, such as what a confirmation is about. It binds its effective
 * `id`, and Content's `aria-describedby` names it while it is mounted, with several Descriptions
 * in the order they registered, shared with any other describer on the `<dialog>` element. It
 * registers with its Dialog's Content once Angular has set its inputs, so a Description rendered
 * by a child component inside Content works too; outside that Content it describes nothing.
 * Requires a nearest Dialog. Describe only short text: a whole form isn't a description.
 *
 * @example
 * ```html
 * <p ogDialogDescription>This can't be undone.</p>
 * ```
 */
@Directive({
  selector: "[ogDialogDescription]",
  providers: [OrigamiDialogDescriptionOptions.provideExisting(() => OrigamiDialogDescription)],
  host: { "[id]": "effectiveId()" },
})
export class OrigamiDialogDescription implements OrigamiDialogDescriptionOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("dialog-description"));

  readonly #options = injectDeferred(OrigamiDialogDescriptionOptions);
  readonly #context = inject(DialogContext);
  readonly #descriptions = inject(DialogDescriptions, { optional: true });
  readonly #destroyRef = inject(DestroyRef);

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());

  /**
   * @internal Joins the nearest Content's Descriptions once Angular has set its inputs; outside
   * its own Dialog's Content it joins nothing.
   */
  ngOnInit(): void {
    if (this.#descriptions?.context === this.#context) {
      this.#descriptions.register({ id: () => this.#options().id() }, this.#destroyRef);
    }
  }
}
