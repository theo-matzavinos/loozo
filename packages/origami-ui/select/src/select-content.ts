import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  afterRenderEffect,
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
import { injectUniqueId, ɵOrigamiPresentationScope } from "@loozo/origami-ui/utils";
import { SelectContext } from "./select-context";

/**
 * Whole Content configuration, the composed Popover Content's fields: every field is required,
 * and defaults on an unused directive never repair an incomplete replacement.
 */
export abstract class OrigamiSelectContentOptions {
  /** Effective reactive DOM ID; the Trigger's `aria-controls` names it while Content is mounted. */
  abstract readonly id: Signal<string>;
  /** Logical main side against the Trigger, direct default `block-end`. */
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
    type: () => Type<OrigamiSelectContentOptions> | AbstractType<OrigamiSelectContentOptions>,
  ): Provider {
    return { provide: OrigamiSelectContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option.
   * @param factory - Runs in injection context; supply `id`, `side`, `align` and a finite
   *   nonnegative `gap`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiSelectContentOptions): Provider {
    return { provide: OrigamiSelectContentOptions, useFactory: factory };
  }
}

/** Whether `element` scrolls its block axis: its content overflows and `overflow-y` clips it. */
function scrolls(element: HTMLElement): boolean {
  const overflow = getComputedStyle(element).overflowY;

  return (
    element.scrollHeight > element.clientHeight && overflow !== "visible" && overflow !== "clip"
  );
}

/**
 * The Select's list: `role="listbox"`, composing Popover Content, so it is persistent,
 * authored in place and presented in the native top layer (`popover="manual"`), and `inert`
 * while it doesn't participate. Options stay mounted while it's closed, so typeahead and the
 * selected option work before it opens. A press inside it keeps focus on the Trigger. When the
 * keys or opening move the active option, the list scrolls its nearest scrolling box inside
 * Content, or Content itself, to show it, never the page; the pointer doesn't scroll it. Under
 * `ogSelectMultiple` it has `aria-multiselectable="true"`.
 *
 * Its `aria-labelledby` is the registered Trigger's while it has one: the Field's Labels inside a
 * Field, otherwise the Trigger's static `aria-labelledby`. Otherwise it is Content's own static
 * `aria-labelledby` from the template, and absent without one. Its `aria-label` is its own static
 * `aria-label` from the template; without one, and while it has no `aria-labelledby`, the
 * registered Trigger's static `aria-label`; otherwise absent. Only template attributes are read:
 * a bound `aria-label` on the Trigger isn't copied, so name Content yourself then, and a value a
 * directive composing Content through `hostDirectives` writes in its `host` isn't read and is
 * removed.
 *
 * Like Popover Content, it exposes `--og-anchor-width` (the Trigger's width) and
 * `--og-available-height` for consumer sizing, retains its children through Presence's exit and
 * exposes that retention as `state.open()`. Scope a custom `display` to `:popover-open` and use
 * `gap`, not margins. Requires a nearest Select root; a second mounted Content fails. The
 * consumer owns dimensions, overflow and styling.
 */
@Directive({
  selector: "[ogSelectContent]",
  exportAs: "ogSelectContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [
    OrigamiSelectContentOptions.provideExisting(() => OrigamiSelectContent),
    OrigamiPopoverContentOptions.provideFactory(() => inject(OrigamiSelectContentOptions)),
  ],
  host: {
    role: "listbox",
    "[attr.aria-labelledby]": "labelledBy()",
    "[attr.aria-label]": "label()",
    "[attr.aria-multiselectable]": "multiselectable()",
    "(mousedown)": "pressed($event)",
  },
})
export class OrigamiSelectContent implements OrigamiSelectContentOptions {
  /** Own ID input, default a generated opaque hosted identity. Replaced Options supply every effective field. */
  readonly id = input(injectUniqueId("select-content"));
  /** Own logical side input, default `block-end`. */
  readonly side = input<OrigamiPopoverSide>("block-end");
  /** Own logical cross alignment input, default `start`. */
  readonly align = input<OrigamiPopoverAlign>("start");
  /** Own main separation input in CSS pixels, default 0; finite and nonnegative. */
  readonly gap = input(0);
  /** Readonly Presence retention of the composed Popover Content, for gating children through an exit. */
  readonly state = inject(OrigamiPopoverContentState);

  readonly #context = inject(SelectContext);
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

  /** @internal The registered Trigger's `aria-labelledby`, else Content's own static one. */
  protected readonly labelledBy = computed(
    () => this.#context.labelledBy() ?? this.#staticLabelledBy,
  );
  /**
   * @internal Content's own static `aria-label`, else the registered Trigger's static one while
   * nothing names Content by `aria-labelledby`.
   */
  protected readonly label = computed(() => {
    if (this.#staticLabel !== null) {
      return this.#staticLabel;
    }

    if (this.labelledBy() !== null) {
      return null;
    }

    return this.#context.triggerLabel();
  });
  /** @internal `"true"` under a multiple root, otherwise absent. */
  protected readonly multiselectable = computed(() => {
    if (this.#context.multiple()) {
      return "true";
    }

    return null;
  });

  constructor() {
    const presentation = inject(ɵOrigamiPresentationScope, { self: true });

    if (!(presentation instanceof ɵOrigamiFloating)) {
      throw new Error("Select Content requires the Popover Content it composes.");
    }

    this.#floating = presentation;

    // After the reveal, so the list has its final size and position.
    afterRenderEffect(() => {
      const reveal = this.#context.reveal();

      if (reveal !== null && this.#floating.ready()) {
        this.#scroll(reveal.option.element);
      }
    });
  }

  /** @internal Registers Content's participation once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerContent(
      { participating: this.#floating.participating },
      this.#destroyRef,
    );
  }

  /** @internal Keeps focus on the Trigger: a press inside the list doesn't move it. */
  protected pressed(event: MouseEvent): void {
    event.preventDefault();
  }

  /** Scrolls the option's nearest scrolling box inside Content, else Content, to show it. */
  #scroll(option: HTMLElement): void {
    let box = option.parentElement;

    while (box !== null && box !== this.#element && !scrolls(box)) {
      box = box.parentElement;
    }

    if (box === null) {
      return;
    }

    const bounds = box.getBoundingClientRect();
    const top = bounds.top + box.clientTop;
    const bottom = top + box.clientHeight;
    const rect = option.getBoundingClientRect();

    if (rect.top < top) {
      box.scrollTop -= top - rect.top;
    } else if (rect.bottom > bottom) {
      box.scrollTop += rect.bottom - bottom;
    }
  }
}
