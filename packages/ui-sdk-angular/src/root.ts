import {
  DestroyRef,
  type Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { OptionsOf, Primitive } from "@ui-sdk/core";
import { UiSdkError } from "./error";
import { ɵinjectInstanceId } from "./instance-id";

/** What a root needs from each of its slots when it's destroyed. */
type RegisteredSlot = { dispose(): void };

/**
 * One core instance per root directive: created on its first read after the directive's inputs
 * are set, kept in sync with them, and destroyed with the directive after its slots.
 */
export class ɵUiSdkRoot<P extends Primitive> {
  /** The core instance id, rendered as the root's `data-ui-sdk-id`. */
  readonly id = ɵinjectInstanceId();
  /** The root's inputs and callback closures, with unset (`undefined`) options dropped. */
  readonly options: Signal<OptionsOf<P>>;
  /**
   * Counts the option handovers to core. A reader of core's option-derived API, like an item's
   * key, reads it, so it re-runs once core has the new options rather than before.
   */
  readonly handovers: Signal<number>;
  readonly #primitive: P;
  readonly #directive: string;
  readonly #slots = new Set<RegisteredSlot>();
  #ready = false;
  #instance: ReturnType<P> | undefined;

  constructor(primitive: P, readOptions: () => OptionsOf<P>, directive: string) {
    this.#primitive = primitive;
    this.#directive = directive;
    this.options = computed(() => definedOptions(readOptions()));

    const handovers = signal(0);

    this.handovers = handovers.asReadonly();

    let first = true;

    effect(() => {
      const next = this.options();
      const instance = this.instance();

      if (first) {
        first = false;

        return;
      }

      untracked(() => {
        instance.setOptions({ ...next, id: this.id });
        handovers.update((count) => count + 1);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      for (const slot of this.#slots) {
        slot.dispose();
      }

      this.#instance?.destroy();
    });
  }

  /** The core instance. Creates it on the first call; throws before `ready()`. */
  instance(): ReturnType<P> {
    if (!this.#ready) {
      throw new UiSdkError(
        `${this.#directive} was read before Angular set its inputs, from a binding on its own element. Read its state from a descendant, another element or a host binding, or style the element by core's attributes, such as [aria-pressed="true"].`,
      );
    }

    if (this.#instance === undefined) {
      const created = this.#primitive({ ...untracked(this.options), id: this.id }) as ReturnType<P>;

      created.follow(() => ({ ...this.options(), id: this.id }));
      this.#instance = created;
    }

    return this.#instance;
  }

  /** Marks the root's inputs as set. The root directive calls it from `ngOnInit`. */
  ready(): void {
    this.#ready = true;
  }

  /**
   * Adds a slot to unbind before the instance is destroyed. The slot calls the returned function
   * when it's destroyed first, so a root that outlives its items doesn't keep them.
   */
  register(slot: RegisteredSlot): () => void {
    this.#slots.add(slot);

    return () => {
      this.#slots.delete(slot);
    };
  }
}

function definedOptions<O extends object>(options: O): O {
  const defined: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(options)) {
    if (value !== undefined) {
      defined[name] = value;
    }
  }

  return defined as O;
}

/**
 * Creates the root for a root directive, from its primitive and a reader of its inputs as core's
 * options. `directive` names it in errors, like `uiSelect`.
 */
export function ɵinjectRoot<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>,
  directive: string,
): ɵUiSdkRoot<P> {
  return new ɵUiSdkRoot(primitive, options, directive);
}
