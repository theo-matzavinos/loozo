import {
  DestroyRef,
  Directive,
  ElementRef,
  afterRenderEffect,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions,
} from "@loozo/origami-ui/collection";
import {
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  ɵOrigamiFloating,
} from "@loozo/origami-ui/popover";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { injectUniqueId, ɵOrigamiPresentationScope } from "@loozo/origami-ui/utils";
import { MenuContentContext } from "./menu-content-context";
import { MenuContext } from "./menu-context";

/**
 * Whole Content configuration, the composed Popover Content's fields: every field is required,
 * and defaults on an unused directive never repair an incomplete replacement.
 */
export abstract class OrigamiMenuContentOptions {
  /** Effective reactive DOM ID; the Trigger's `aria-controls` names it while Content is mounted. */
  abstract readonly id: Signal<string>;
  /** Logical main side against the Trigger, direct default `block-end`, `inline-end` inside an `ogMenuSub`. */
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
    type: () => Type<OrigamiMenuContentOptions> | AbstractType<OrigamiMenuContentOptions>,
  ): Provider {
    return { provide: OrigamiMenuContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option.
   * @param factory - Runs in injection context; supply `id`, `side`, `align` and a finite
   *   nonnegative `gap`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiMenuContentOptions): Provider {
    return { provide: OrigamiMenuContentOptions, useFactory: factory };
  }
}

/** The direct `side` default: below the Trigger, or beside the sub-trigger inside a Sub. */
function defaultSide(): OrigamiPopoverSide {
  if (inject(MenuContext).parent !== null) {
    return "inline-end";
  }

  return "block-end";
}

/**
 * The menu: `role="menu"`, composing Popover Content, so it is persistent, authored in place and
 * presented in the native top layer (`popover="manual"`), and `inert` while it doesn't
 * participate. It is named by the Trigger (`aria-labelledby`, absent until the Trigger
 * registers), which must be in the same tree root: both in the document, or both in one shadow
 * root.
 *
 * Its items take real focus, also items in an open shadow root inside it, such as a child
 * component's, and every item has `tabindex="-1"`: the menu adds no Tab stop.
 * Content itself has `tabindex="-1"` and holds focus while a menu opened from the Trigger has no
 * item yet, such as items in a deferred block that hasn't hydrated; the first item to arrive then
 * takes focus. ArrowDown and ArrowUp move focus to the next and previous item and wrap, Home and
 * End to the first and last, disabled items included; characters typed within 500 ms of each
 * other focus the next item whose `label`, else whose text, starts with them, and repeating one
 * character cycles; Space joins a running search. Tab and Shift+Tab close the menu and move on
 * from the Trigger's place in the page; Escape closes it and focuses the Trigger. The mouse
 * moving over an item focuses it, so style `:focus` as the highlight.
 *
 * Inside an `ogMenuSub` it is that submenu: named by and placed beside its sub-trigger
 * (`side` defaults to `inline-end`), ArrowLeft, or ArrowRight in right to left, and Escape close
 * it and focus the sub-trigger, and Tab and Shift+Tab close the whole tree from the root's
 * Trigger.
 *
 * Like Popover Content, it exposes `--og-anchor-width` and `--og-available-height` for consumer
 * sizing, retains its children through Presence's exit and exposes that retention as
 * `state.open()`. Scope a custom `display` to `:popover-open` and use `gap`, not margins. Requires
 * a nearest Menu root; a second mounted Content fails. The consumer owns dimensions, overflow and
 * styling.
 */
@Directive({
  selector: "[ogMenuContent]",
  exportAs: "ogMenuContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [
    OrigamiMenuContentOptions.provideExisting(() => OrigamiMenuContent),
    OrigamiPopoverContentOptions.provideFactory(() => inject(OrigamiMenuContentOptions)),
    ɵOrigamiRovingFocusContext,
    ɵOrigamiRovingFocusOptions.provideFactory(() => ({
      orientation: computed(() => "vertical" as const),
      preferred: computed(() => []),
    })),
    MenuContentContext,
  ],
  host: {
    role: "menu",
    tabindex: "-1",
    "[attr.aria-labelledby]": "labelledBy()",
    "(keydown)": "keydown($event)",
    "(keyup)": "keyup($event)",
    "(focusout)": "left($event)",
    "(pointerdown)": "pressed()",
  },
})
export class OrigamiMenuContent implements OrigamiMenuContentOptions {
  /** Own ID input, default a generated opaque hosted identity. Replaced Options supply every effective field. */
  readonly id = input(injectUniqueId("menu-content"));
  /** Own logical side input, default `block-end`, or `inline-end` inside an `ogMenuSub`. */
  readonly side = input<OrigamiPopoverSide>(defaultSide());
  /** Own logical cross alignment input, default `start`. */
  readonly align = input<OrigamiPopoverAlign>("start");
  /** Own main separation input in CSS pixels, default 0; finite and nonnegative. */
  readonly gap = input(0);
  /** Readonly Presence retention of the composed Popover Content, for gating children through an exit. */
  readonly state = inject(OrigamiPopoverContentState);

  readonly #menu = inject(MenuContext);
  readonly #context = inject(MenuContentContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #floating: ɵOrigamiFloating;

  /** @internal The registered Trigger's ID. */
  protected readonly labelledBy = this.#menu.triggerId;

  constructor() {
    const presentation = inject(ɵOrigamiPresentationScope, { self: true });

    if (!(presentation instanceof ɵOrigamiFloating)) {
      throw new Error("Menu Content requires the Popover Content it composes.");
    }

    this.#floating = presentation;
    this.#context.attach(this.#element);

    // After the reveal, so the item is shown when it takes focus; again as items register.
    afterRenderEffect(() => {
      const entry = this.#menu.entry();

      if (entry !== null && this.#floating.ready() && this.#floating.participating()) {
        this.#context.fulfil(entry);
      }
    });
  }

  /** @internal Registers Content's participation once Angular has set its inputs. */
  ngOnInit(): void {
    this.#menu.registerContent(
      { element: this.#element, participating: this.#floating.participating },
      this.#destroyRef,
    );
  }

  /** @internal Keys from an item or Content. */
  protected keydown(event: KeyboardEvent): void {
    this.#context.keydown(event);
  }

  /** @internal */
  protected keyup(event: KeyboardEvent): void {
    this.#context.keyup(event);
  }

  /** @internal Focus leaving the menu ends a search's held Space. */
  protected left(event: FocusEvent): void {
    this.#context.left(event);
  }

  /** @internal A press is pointer input: hover may move focus again, and a resting mouse's wait ends. */
  protected pressed(): void {
    this.#menu.pointed();
    this.#context.pressed();
  }
}
