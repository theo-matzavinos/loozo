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
import { injectDeferred, injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import type { OrigamiQuerySuggestion } from "./query-analysis";
import { QueryFieldContentScope } from "./query-field-content";
import { QueryFieldContext } from "./query-field-context";
import type { QueryFieldSuggestionRegistration } from "./query-field-context";

/**
 * Effective row configuration, read once the row has registered in `ngOnInit`, after Angular set
 * its inputs. `S` is the consumer's suggestion type.
 */
export abstract class OrigamiQueryFieldSuggestionOptions<
  S extends OrigamiQuerySuggestion = OrigamiQuerySuggestion,
> {
  /**
   * The suggestion this row shows, one of `state.suggestions()` by identity. Required: there is
   * no default. A row whose suggestion isn't current is hidden and can't be highlighted or picked.
   */
  abstract readonly suggestion: Signal<S>;

  /**
   * Replaces row Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting<S extends OrigamiQuerySuggestion>(
    type: () =>
      | Type<OrigamiQueryFieldSuggestionOptions<S>>
      | AbstractType<OrigamiQueryFieldSuggestionOptions<S>>,
  ): Provider {
    return { provide: OrigamiQueryFieldSuggestionOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all row Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `suggestion`.
   * @returns A local provider.
   */
  static provideFactory<S extends OrigamiQuerySuggestion>(
    factory: () => OrigamiQueryFieldSuggestionOptions<S>,
  ): Provider {
    return { provide: OrigamiQueryFieldSuggestionOptions, useFactory: factory };
  }
}

/**
 * One suggestion row inside an `ogQueryFieldContent`: `role="option"` with its `id` (authored, else generated),
 * `aria-selected` (`"true"` on the highlighted row, else `"false"`) and an empty
 * `data-active` marker while highlighted. Focus never moves to it: the input names the highlighted
 * row with `aria-activedescendant`. Moving the pointer over it highlights it, without scrolling;
 * clicking it picks the suggestion it showed when the press went down, while it still shows it.
 *
 * Render one per `state.suggestions()` entry, `track $index` is fine. A row whose suggestion isn't
 * current, as one kept mounted while a deferred view fills, carries `hidden` (keep `[hidden]`
 * `display: none` in your CSS), so it's out of paint and the accessibility tree, and can't be
 * highlighted or picked. While the caret's token is invalid and the Message is mounted, its
 * `aria-describedby` names the Message, merged with a co-applied `ogTooltipTrigger`'s IDs.
 * Outside an `ogQueryFieldContent` of its own query field it throws at construction.
 */
@Directive({
  selector: "[ogQueryFieldSuggestion]",
  exportAs: "ogQueryFieldSuggestion",
  hostDirectives: [ɵOrigamiDescribedBy],
  providers: [
    OrigamiQueryFieldSuggestionOptions.provideExisting(() => OrigamiQueryFieldSuggestion),
  ],
  host: {
    role: "option",
    "[id]": "id()",
    "[attr.aria-selected]": "selected()",
    "[attr.data-active]": "active()",
    "[attr.hidden]": "hidden()",
    "(pointerdown)": "pressed($event)",
    "(document:pointerup)": "released($event)",
    "(document:pointercancel)": "cancelled($event)",
    "(click)": "clicked()",
    "(pointermove)": "pointed()",
  },
})
export class OrigamiQueryFieldSuggestion<
  S extends OrigamiQuerySuggestion = OrigamiQuerySuggestion,
> implements OrigamiQueryFieldSuggestionOptions<S> {
  /** Own suggestion input, required; replaced Options supply the effective suggestion. */
  readonly suggestion = input.required<S>();

  /** Own ID input, default a generated opaque hosted identity, stable across hydration. */
  readonly id = input(injectUniqueId("query-field-suggestion"));

  readonly #options = injectDeferred<OrigamiQueryFieldSuggestionOptions<S>>(
    OrigamiQueryFieldSuggestionOptions,
  );
  readonly #context = inject(QueryFieldContext);
  readonly #describedBy = inject(ɵOrigamiDescribedBy, { self: true });
  readonly #destroyRef = inject(DestroyRef);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #registration: QueryFieldSuggestionRegistration;
  /**
   * The suggestion the row showed when a primary press went down on it, the Input interaction it
   * went down in and its pointer, until its click, its cancellation or its release elsewhere.
   */
  #press: {
    readonly suggestion: OrigamiQuerySuggestion;
    readonly interaction: number;
    readonly pointerId: number;
  } | null = null;
  #destroyed = false;

  /** @internal `"true"` on the highlighted row. */
  protected readonly selected = computed(() =>
    String(this.#context.highlighted() === this.#registration),
  );
  /** @internal Active marker. */
  protected readonly active = computed(() => {
    if (this.#context.highlighted() === this.#registration) {
      return "";
    }

    return null;
  });
  /** @internal Hidden while its suggestion isn't current. */
  protected readonly hidden = computed(() => {
    if (this.#context.current(this.#registration.suggestion())) {
      return null;
    }

    return "";
  });

  constructor() {
    const scope = inject(QueryFieldContentScope, { optional: true });

    if (scope === null || scope.context !== this.#context) {
      throw new Error("ogQueryFieldSuggestion must be inside ogQueryFieldContent.");
    }

    const suggestion = computed<OrigamiQuerySuggestion>(() => this.#options().suggestion());

    this.#registration = {
      element: this.#element,
      id: this.id,
      suggestion,
      disabled: computed(() => !this.#context.current(suggestion())),
    };
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers the row, and names the Message while it shows, once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerSuggestion(this.#registration, this.#destroyRef);
    this.#describedBy.register(() => {
      const id = this.#context.messageId();

      if (id === null || !this.#context.message()) {
        return [];
      }

      return [id];
    }, this.#destroyRef);
  }

  /** @internal A primary press on a Shown list's row records the suggestion it shows. */
  protected pressed(event: PointerEvent): void {
    this.#press = null;

    if (!this.#destroyed && event.isPrimary && event.button === 0 && this.#context.shown()) {
      this.#press = {
        suggestion: this.#registration.suggestion(),
        interaction: this.#context.interaction(),
        pointerId: event.pointerId,
      };
    }
  }

  /** @internal The press's pointer released outside the row: no click of it can follow. */
  protected released(event: PointerEvent): void {
    if (
      this.#press?.pointerId === event.pointerId &&
      !(event.target instanceof Node && this.#element.contains(event.target))
    ) {
      this.#press = null;
    }
  }

  /** @internal The press's pointer was cancelled: its gesture ends without a click. */
  protected cancelled(event: PointerEvent): void {
    if (this.#press?.pointerId === event.pointerId) {
      this.#press = null;
    }
  }

  /** @internal A click picks the suggestion recorded at the press, in the press's Input interaction. */
  protected clicked(): void {
    const press = this.#press;

    this.#press = null;

    if (!this.#destroyed && press !== null) {
      this.#context.clicked(this.#registration, press.suggestion, press.interaction);
    }
  }

  /** @internal The pointer highlights the row. */
  protected pointed(): void {
    if (!this.#destroyed) {
      this.#context.point(this.#registration);
    }
  }
}
