import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  Service,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  ɵOrigamiFloating,
} from "@loozo/origami-ui/popover";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId, ɵOrigamiPresentationScope } from "@loozo/origami-ui/utils";
import { QueryFieldContext } from "./query-field-context";

/**
 * Whole Content configuration, the composed Popover Content's fields: every field is required,
 * and defaults on an unused directive never repair an incomplete replacement.
 */
export abstract class OrigamiQueryFieldContentOptions {
  /** Effective reactive DOM ID; the input's `aria-controls` names it while Content is registered. */
  abstract readonly id: Signal<string>;
  /** Logical main side against the input, direct default `block-end`. */
  abstract readonly side: Signal<OrigamiPopoverSide>;
  /** Logical cross alignment, direct default `start`. */
  abstract readonly align: Signal<OrigamiPopoverAlign>;
  /**
   * Main-side separation in CSS pixels, direct default 0. Must be finite and nonnegative;
   * reading an invalid effective value throws `RangeError`.
   */
  abstract readonly gap: Signal<number>;

  /**
   * Replaces every Content Option with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class whose instances
   *   supply all four signals; forward references are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiQueryFieldContentOptions>
      | AbstractType<OrigamiQueryFieldContentOptions>,
  ): Provider {
    return { provide: OrigamiQueryFieldContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option.
   * @param factory - Runs in injection context; supply `id`, `side`, `align` and a finite
   *   nonnegative `gap`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiQueryFieldContentOptions): Provider {
    return { provide: OrigamiQueryFieldContentOptions, useFactory: factory };
  }
}

/**
 * @internal Content's scope, which its Suggestions and its Message inject: they register through
 * it, so only rows and a Message inside the registered Content of their own query field count.
 */
@Service({ autoProvided: false })
export class QueryFieldContentScope {
  /** The query field this Content belongs to. */
  readonly context = inject(QueryFieldContext);
}

/**
 * The query field's popup list: `role="listbox"`, composing Popover Content, so it's persistent,
 * authored in place and presented in the native top layer (`popover="manual"`), and `inert` while
 * it isn't presented. Put the `ogQueryFieldSuggestion` rows and the `ogQueryFieldMessage` inside
 * it; outside it they throw. It presents while the caret has current rows, or the Message while
 * the caret's token is invalid, and is `aria-hidden="true"` unless it has current rows, so a
 * message alone isn't a listbox. A press inside it keeps focus in the input. Keyboard moves scroll
 * its nearest scrolling box, never the page.
 *
 * Its `aria-labelledby` is the input's while that has one (the Field's Labels), else its own
 * static one; its `aria-label` is its own static one, else, while nothing labels it by ID, the
 * input's static `aria-label`. Like Popover Content, it exposes `--og-anchor-width`,
 * `--og-available-height` and `data-side`, retains its children through Presence's exit and
 * exposes that retention as `state.open()`. Requires a nearest query field root; a second mounted
 * Content fails.
 */
@Directive({
  selector: "[ogQueryFieldContent]",
  exportAs: "ogQueryFieldContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [
    OrigamiQueryFieldContentOptions.provideExisting(() => OrigamiQueryFieldContent),
    OrigamiPopoverContentOptions.provideFactory(() => inject(OrigamiQueryFieldContentOptions)),
    QueryFieldContentScope,
  ],
  host: {
    role: "listbox",
    "[attr.aria-hidden]": "hidden()",
    "[attr.aria-labelledby]": "labelledBy()",
    "[attr.aria-label]": "label()",
    "(mousedown)": "pressed($event)",
  },
})
export class OrigamiQueryFieldContent implements OrigamiQueryFieldContentOptions {
  /** Own ID input, default a generated opaque hosted identity. Replaced Options supply every effective field. */
  readonly id = input(injectUniqueId("query-field-content"));
  /** Own logical side input, default `block-end`. */
  readonly side = input<OrigamiPopoverSide>("block-end");
  /** Own logical cross alignment input, default `start`. */
  readonly align = input<OrigamiPopoverAlign>("start");
  /** Own main separation input in CSS pixels, default 0; finite and nonnegative. */
  readonly gap = input(0);
  /** Readonly Presence retention of the composed Popover Content, for gating children through an exit. */
  readonly state = inject(OrigamiPopoverContentState);

  readonly #options = injectDeferred(OrigamiQueryFieldContentOptions);
  readonly #context = inject(QueryFieldContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #floating: ɵOrigamiFloating;
  readonly #staticLabelledBy = inject(new HostAttributeToken("aria-labelledby"), {
    optional: true,
  });
  readonly #staticLabel = inject(new HostAttributeToken("aria-label"), { optional: true });

  /** @internal Hidden from assistive technology unless it has current rows. */
  protected readonly hidden = computed(() => {
    if (this.#context.hasCurrentRows()) {
      return null;
    }

    return "true";
  });
  /** @internal The input's `aria-labelledby`, else Content's own static one. */
  protected readonly labelledBy = computed(
    () => this.#context.labelledBy() ?? this.#staticLabelledBy,
  );
  /** @internal Content's own static `aria-label`, else the input's while nothing labels it by ID. */
  protected readonly label = computed(() => {
    if (this.#staticLabel !== null) {
      return this.#staticLabel;
    }

    if (this.labelledBy() !== null) {
      return null;
    }

    return this.#context.inputLabel();
  });

  constructor() {
    const presentation = inject(ɵOrigamiPresentationScope, { self: true });

    if (!(presentation instanceof ɵOrigamiFloating)) {
      throw new Error("Query field Content requires the Popover Content it composes.");
    }

    this.#floating = presentation;
    this.#context.scrollReveals(this.#element, () => this.#floating.ready());
  }

  /** @internal Registers Content's participation and ID once Angular has set its inputs. */
  ngOnInit(): void {
    const floating = this.#floating;

    this.#context.registerContent(
      {
        element: this.#element,
        id: computed(() => this.#options().id()),
        participating: floating.participating,
        isParticipating: () => floating.isParticipating(),
      },
      this.#destroyRef,
    );
  }

  /** @internal Keeps focus in the input: a press inside the list doesn't move it. */
  protected pressed(event: MouseEvent): void {
    event.preventDefault();
  }
}
