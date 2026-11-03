import {
  DestroyRef,
  Directive,
  ElementRef,
  Service,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiPresence,
  OrigamiPresenceOptions,
  OrigamiPresenceState,
} from "@loozo/origami-ui/presence";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ToastRegionContext } from "./toast-region";
import type { OrigamiToastRecord } from "./toaster";

/** Whole, substitutable Toast configuration, resolved after construction. */
export abstract class OrigamiToastOptions {
  /**
   * The record this element renders, one of its region's `state.toasts()`. Required; the record's
   * id is read live, so render the list with `track toast.id` to keep each element with its toast.
   */
  abstract readonly toast: Signal<OrigamiToastRecord<unknown>>;

  /**
   * Replaces the Toast's Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToastOptions> | AbstractType<OrigamiToastOptions>,
  ): Provider {
    return { provide: OrigamiToastOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the Toast's Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `toast`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiToastOptions): Provider {
    return { provide: OrigamiToastOptions, useFactory: factory };
  }
}

/** @internal One mounted toast: its record's open state, its exit and its close. */
@Service({ autoProvided: false })
export class ToastContext {
  readonly #options = injectDeferred(OrigamiToastOptions);
  readonly #region = inject(ToastRegionContext);

  /** Whether the record is shown and not closing; false from the close request on. */
  readonly open = computed(() => this.#region.open(this.#options().toast().id));

  constructor() {
    const presence = inject(OrigamiPresenceState);

    // Once the exit has settled, the region removes the record and the consumer's view with it.
    effect(() => {
      if (presence.phase() === "closed") {
        untracked(() => this.#region.settled(this.#options().toast().id));
      }
    });
  }

  /** From the Toast's `ngOnInit`: the region moves focus out of this element when it closes. */
  register(element: HTMLElement, destroyRef: DestroyRef): void {
    this.#region.registerToast({ id: () => this.#options().toast().id, element }, destroyRef);
  }

  /** Its Close's view was destroyed: the region checks again whether focus is inside it. */
  closeRemoved(): void {
    this.#region.partRemoved();
  }

  /** Closes this toast, as its Close does. */
  close(): void {
    this.#region.close(untracked(() => this.#options().toast().id));
  }
}

/** Locally provided readonly observation of one toast. */
@Service({ autoProvided: false })
export class OrigamiToastState {
  readonly #context = inject(ToastContext);

  /**
   * True while the toast is shown; false from its close request on, while its exit runs. Its
   * composed Presence retains the element through the exit. Readonly; never writable.
   */
  readonly open: Signal<boolean> = this.#context.open;
}

/**
 * One rendered toast: an element of the region's `@for`, bound to its record. It composes
 * Presence, so it carries `data-entering` while it enters and `data-leaving` while it runs its
 * exit, and the region removes the record once the exit settles, which removes the element. With
 * no animation, also under reduced-motion CSS, it is removed at once. While its exit runs it is
 * `inert`, so Tab and the pointer skip it. It adds no role or live attributes: its addition to the
 * region is the announcement, and its whole text is read, a Close button's name included. Requires
 * a nearest `ogToastRegion`.
 *
 * @example
 * ```html
 * @for (toast of region.state.toasts(); track toast.id) {
 *   <li [ogToast]="toast" [attr.data-kind]="toast.data.kind">{{ toast.data.title }}</li>
 * }
 * ```
 */
@Directive({
  selector: "[ogToast]",
  exportAs: "ogToast",
  hostDirectives: [OrigamiPresence],
  providers: [
    ToastContext,
    OrigamiToastState,
    OrigamiToastOptions.provideExisting(() => OrigamiToast),
    OrigamiPresenceOptions.provideFactory(() => ({ present: inject(ToastContext).open })),
  ],
  host: { "[attr.inert]": "inactive()" },
})
export class OrigamiToast implements OrigamiToastOptions {
  /**
   * Own required input, `[ogToast]="toast"`: a record of the region's `state.toasts()`. Replaced
   * Options supply the effective record instead.
   */
  readonly toast = input.required<OrigamiToastRecord<unknown>>({ alias: "ogToast" });
  /** This toast's readonly observation, shared with its descendants. */
  readonly state = inject(OrigamiToastState);

  readonly #context = inject(ToastContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);

  /** @internal A closing toast can't be a keyboard target through its retained exit. */
  protected readonly inactive = computed(() => {
    if (this.state.open()) {
      return null;
    }

    return "";
  });

  /** @internal Joins its region once Angular has set its input, so a close can move focus out of it. */
  ngOnInit(): void {
    this.#context.register(this.#element, this.#destroyRef);
  }
}
