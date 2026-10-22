import {
  DestroyRef,
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { ɵOrigamiIntent } from "@loozo/origami-ui/utils";
import type { OrigamiDialogTriggerOptions } from "./dialog-trigger";

/** Whole, substitutable root configuration, resolved after construction. */
export abstract class OrigamiDialogOptions {
  /**
   * Requested open state, writable by behavior; direct model default false. Not whether the
   * dialog is modal now: the native session outlives a close through Content's exit.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * User-dismissal permission, direct default true: Escape, a close request such as the back
   * gesture, and a backdrop click. Close buttons and writes to `open` always close.
   */
  abstract readonly dismissible: Signal<boolean>;

  /**
   * Replaces all root Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDialogOptions> | AbstractType<OrigamiDialogOptions>,
  ): Provider {
    return { provide: OrigamiDialogOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all root Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `open` and `dismissible`. Ordinary
   *   writable signals are valid.
   * @returns A local provider; writes do not fabricate outputs from an unused directive model.
   */
  static provideFactory(factory: () => OrigamiDialogOptions): Provider {
    return { provide: OrigamiDialogOptions, useFactory: factory };
  }
}

/** The ARIA role Content renders: the native `<dialog>`'s own, or an alert dialog's. */
export type DialogRole = "dialog" | "alertdialog";

/**
 * Package-private role of the root on the same element. Nothing provides it yet, so a Dialog is a
 * `dialog`; an alert dialog variant provides `"alertdialog"` next to the root it composes.
 */
export const ɵOrigamiDialogRole = new InjectionToken<DialogRole>("ɵOrigamiDialogRole");

type Policy = { readonly dismissible: boolean };
type TriggerPart = {
  readonly element: HTMLElement;
  readonly options: () => OrigamiDialogTriggerOptions;
};
type ContentPart = { readonly options: () => { readonly id: Signal<string> } };
type IdPart = { readonly id: () => string };

/** @internal Nearest Dialog owner. Not exported as an application authoring API. */
@Service({ autoProvided: false })
export class DialogContext {
  readonly #options = injectDeferred(OrigamiDialogOptions);
  readonly #trigger = signal<TriggerPart | null>(null);
  readonly #content = signal<ContentPart | null>(null);
  readonly #titles = signal<readonly IdPart[]>([]);
  #destroyed = false;

  /** Effective role; only a variant on the root's own element sets it. */
  readonly role: DialogRole =
    inject(ɵOrigamiDialogRole, { optional: true, self: true }) ?? "dialog";
  // A new object for every effective decision, compared by identity in dismissal snapshots.
  readonly intent = computed<ɵOrigamiIntent>(() => ({ open: this.#options().open() }));
  readonly policy = computed<Policy>(() => ({ dismissible: this.#options().dismissible() }));
  readonly desired = computed(() => this.intent().open);
  readonly dismissible = computed(() => this.policy().dismissible);
  readonly trigger = this.#trigger.asReadonly();
  readonly contentId = computed(() => this.#content()?.options().id() ?? null);
  /** Registered Title IDs in registration order, joined for `aria-labelledby`. */
  readonly titleIds = computed(() => {
    const ids: string[] = [];

    for (const title of this.#titles()) {
      ids.push(title.id());
    }

    return ids.join(" ");
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** Writes `open`. Every close but a user dismissal comes here: it ignores `dismissible`. */
  setOpen(open: boolean): void {
    if (!this.#destroyed) {
      this.#options().open.set(open);
    }
  }

  /** Registers the Trigger from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerTrigger(part: TriggerPart, destroyRef: DestroyRef): void {
    this.#registerOne(this.#trigger, part, "trigger", destroyRef);
  }

  /** Registers Content from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerContent(part: ContentPart, destroyRef: DestroyRef): void {
    this.#registerOne(this.#content, part, "content", destroyRef);
  }

  /** Whether `part` is the registered Content: a second, failed Content never opens. */
  isContent(part: ContentPart): boolean {
    return this.#content() === part;
  }

  /** Adds a Title's ID after those already registered, from its `ngOnInit`; `destroyRef` removes it. */
  registerTitle(part: IdPart, destroyRef: DestroyRef): void {
    this.#registerMany(this.#titles, part, destroyRef);
  }

  /** A hook earlier in the part's view can destroy that view before the part's `ngOnInit` runs. */
  #registerOne<T>(
    slot: WritableSignal<T | null>,
    part: T,
    role: string,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (slot() !== null) {
      throw new Error(`Dialog supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (slot() === part) {
        slot.set(null);
      }
    });
  }

  #registerMany(list: WritableSignal<readonly IdPart[]>, part: IdPart, destroyRef: DestroyRef) {
    if (destroyRef.destroyed) {
      return;
    }

    list.update((parts) => [...parts, part]);
    destroyRef.onDestroy(() => {
      const remaining: IdPart[] = [];

      for (const mounted of list()) {
        if (mounted !== part) {
          remaining.push(mounted);
        }
      }

      list.set(remaining);
    });
  }
}

/** Nearest root's locally provided readonly facade; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiDialogState {
  readonly #context = inject(DialogContext);
  /**
   * Effective requested state. It turns false as soon as a close is requested, while Content's
   * exit still keeps the dialog modal; Content State reports that retention. Never writable.
   */
  readonly open: Signal<boolean> = this.#context.desired;
  /** Effective user-dismissal permission; close buttons and writes to `open` ignore it. */
  readonly dismissible: Signal<boolean> = this.#context.dismissible;
}

/**
 * Modal Dialog owner: the requested `open` state and the user-dismissal policy for one native
 * `<dialog ogDialogContent>`, opened with `showModal()`. Parts belong to the nearest root; nested
 * roots are independent, and a Dialog opened from inside another stacks above it natively. Close
 * a Dialog nested in another, its `<dialog>` inside the other's however it got there (declared,
 * projected or slotted), before or together with the outer one: an inner one still requested
 * open when the outer natively closes is reported through `ErrorHandler`, since the browser keeps
 * it modal but unrendered.
 * The root may share the `<dialog>` element with Content, and a component can be the root through
 * `hostDirectives`. Consumers own the trigger, markup, names, styling and animation.
 *
 * Every close request goes through `open`: a Trigger opens it, a Close button, a model write and
 * an accepted user dismissal (Escape, the back gesture or `requestClose()`, a backdrop click)
 * close it, and Content keeps the dialog modal until its exit animation ends.
 *
 * @example
 * ```html
 * <button ogButton (click)="filtersOpen.set(true)">Filters</button>
 * <div ogDialog [(open)]="filtersOpen">
 *   <dialog ogDialogContent>
 *     <h2 ogDialogTitle>Filters</h2>
 *     <button ogDialogClose>Done</button>
 *   </dialog>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogDialog]",
  exportAs: "ogDialog",
  providers: [
    DialogContext,
    OrigamiDialogState,
    OrigamiDialogOptions.provideExisting(() => OrigamiDialog),
  ],
})
export class OrigamiDialog implements OrigamiDialogOptions {
  /** Own requested-state model, default false; `openChange` emits accepted writes to this model. Replaced Options do not emit unused model outputs. */
  readonly open = model(false);
  /**
   * Own boolean-attribute-coerced user-dismissal input, default true. False vetoes Escape, close
   * requests and backdrop clicks; Close buttons and `open` writes still close. Replaced Options
   * drive effective policy.
   */
  readonly dismissible = input(true, { transform: booleanAttribute });
  /** Local readonly facade of effective root Options. */
  readonly state = inject(OrigamiDialogState);
}
