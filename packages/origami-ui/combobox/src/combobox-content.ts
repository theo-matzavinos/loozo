import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
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
import { ComboboxContext } from "./combobox-context";

/**
 * Whole Content configuration, the composed Popover Content's fields: every field is required,
 * and defaults on an unused directive never repair an incomplete replacement.
 */
export abstract class OrigamiComboboxContentOptions {
  /** Effective reactive DOM ID; the input's `aria-controls` names it while Content is mounted. */
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
    type: () => Type<OrigamiComboboxContentOptions> | AbstractType<OrigamiComboboxContentOptions>,
  ): Provider {
    return { provide: OrigamiComboboxContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option.
   * @param factory - Runs in injection context; supply `id`, `side`, `align` and a finite
   *   nonnegative `gap`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiComboboxContentOptions): Provider {
    return { provide: OrigamiComboboxContentOptions, useFactory: factory };
  }
}

/**
 * The Combobox's list: `role="listbox"`, composing Popover Content, so it is persistent,
 * authored in place and presented in the native top layer (`popover="manual"`), and `inert`
 * while it doesn't participate. Render only the options that match the query, with `@for` or
 * `@if`: a hidden option that stays mounted can still be highlighted and chosen. A press inside it
 * keeps focus in the input. When the keys move the highlight, the list scrolls its nearest
 * scrolling box inside Content, or Content itself, to show the option, never the page; the pointer
 * doesn't scroll it.
 *
 * Its `aria-labelledby` is the registered input's while it has one: the Field's Labels inside a
 * Field, otherwise the input's static `aria-labelledby`. Otherwise it is Content's own static
 * `aria-labelledby` from the template, and absent without one. Its `aria-label` is its own static
 * `aria-label` from the template; without one, and while it has no `aria-labelledby`, the
 * registered input's static `aria-label`; otherwise absent. Only template attributes are read: a
 * bound `aria-label` on the input isn't copied, so name Content yourself then.
 *
 * Like Popover Content, it exposes `--og-anchor-width` (the input's width) and
 * `--og-available-height` for consumer sizing, retains its children through Presence's exit and
 * exposes that retention as `state.open()`. Scope a custom `display` to `:popover-open` and use
 * `gap`, not margins. Requires a nearest Combobox root; a second mounted Content fails. The
 * consumer owns dimensions, overflow, an empty-results message and styling.
 */
@Directive({
  selector: "[ogComboboxContent]",
  exportAs: "ogComboboxContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [
    OrigamiComboboxContentOptions.provideExisting(() => OrigamiComboboxContent),
    OrigamiPopoverContentOptions.provideFactory(() => inject(OrigamiComboboxContentOptions)),
  ],
  host: {
    role: "listbox",
    "[attr.aria-labelledby]": "labelledBy()",
    "[attr.aria-label]": "label()",
    "(mousedown)": "pressed($event)",
  },
})
export class OrigamiComboboxContent implements OrigamiComboboxContentOptions {
  /** Own ID input, default a generated opaque hosted identity. Replaced Options supply every effective field. */
  readonly id = input(injectUniqueId("combobox-content"));
  /** Own logical side input, default `block-end`. */
  readonly side = input<OrigamiPopoverSide>("block-end");
  /** Own logical cross alignment input, default `start`. */
  readonly align = input<OrigamiPopoverAlign>("start");
  /** Own main separation input in CSS pixels, default 0; finite and nonnegative. */
  readonly gap = input(0);
  /** Readonly Presence retention of the composed Popover Content, for gating children through an exit. */
  readonly state = inject(OrigamiPopoverContentState);

  readonly #options = injectDeferred(OrigamiComboboxContentOptions);
  readonly #context = inject(ComboboxContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #floating: ɵOrigamiFloating;

  /**
   * Content's template `aria-labelledby`. The template, not the element: under hydration the
   * element holds the server's bound value.
   */
  readonly #staticLabelledBy = inject(new HostAttributeToken("aria-labelledby"), {
    optional: true,
  });

  /** Content's template `aria-label`, read like its `aria-labelledby`. */
  readonly #staticLabel = inject(new HostAttributeToken("aria-label"), { optional: true });

  /** @internal The registered input's `aria-labelledby`, else Content's own static one. */
  protected readonly labelledBy = computed(
    () => this.#context.labelledBy() ?? this.#staticLabelledBy,
  );
  /**
   * @internal Content's own static `aria-label`, else the registered input's static one while
   * nothing names Content by `aria-labelledby`.
   */
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
      throw new Error("Combobox Content requires the Popover Content it composes.");
    }

    this.#floating = presentation;

    // After the reveal, so the list has its final size and position.
    this.#context.scrollReveals(this.#element, () => this.#floating.ready());
  }

  /** @internal Registers Content's participation and ID once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerContent(
      {
        participating: this.#floating.participating,
        id: computed(() => this.#options().id()),
      },
      this.#destroyRef,
    );
  }

  /** @internal Keeps focus in the input: a press inside the list doesn't move it. */
  protected pressed(event: MouseEvent): void {
    event.preventDefault();
  }
}
