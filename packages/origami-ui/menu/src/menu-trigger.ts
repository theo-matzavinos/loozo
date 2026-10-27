import {
  DestroyRef,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiPopoverAnchor,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverTrigger,
  OrigamiPopoverTriggerOptions,
} from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { OrigamiMenuState } from "./menu";
import { MenuContext } from "./menu-context";

/** Substitutable Trigger identity and disabled policy; it supplies the composed Popover Trigger's and Anchor's Options. */
export abstract class OrigamiMenuTriggerOptions {
  /** Effective reactive DOM ID, which also names the menu (Content's `aria-labelledby`). */
  abstract readonly id: Signal<string>;
  /**
   * Blocks this Trigger's user opening, combined with the Menu's disabled; direct default false.
   * Becoming true closes an open menu. Like the root's, it doesn't block authoritative writes.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Trigger is disabled, by the Menu or its own Options, it stays focusable:
   * `aria-disabled="true"` and `data-disabled` without native `disabled`. Opening stays
   * blocked, but the button's own `(click)` listeners still run. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Replaces Trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuTriggerOptions> | AbstractType<OrigamiMenuTriggerOptions>,
  ): Provider {
    return { provide: OrigamiMenuTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Trigger Options configuration without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`, `disabled` and
   *   `focusableWhenDisabled`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiMenuTriggerOptions): Provider {
    return { provide: OrigamiMenuTriggerOptions, useFactory: factory };
  }
}

/**
 * The button that opens an `ogMenu`: a native `type="button"` with `aria-haspopup="menu"`. It
 * composes the Popover Trigger and Anchor, so the menu is positioned against it, `aria-expanded`
 * reports whether the menu participates and `aria-controls` names mounted Content.
 *
 * Enter, Space and ArrowDown open the menu and focus its first item; ArrowUp opens it on the last.
 * The Trigger handles those keys itself and prevents their default, so the button's own click
 * never toggles the menu a second time. Keys with Alt, Ctrl or Meta, keys already
 * `defaultPrevented` and keys during IME composition are ignored. A click toggles the menu, and
 * a menu it opens focuses its first item once it is shown; the click also focuses the Trigger
 * when the engine doesn't (macOS Safari). While an opening hasn't reached its item yet, Enter and
 * Space do nothing, so the menu keeps opening. While the menu is open, ArrowDown and ArrowUp focus
 * its first or last item again, and Enter or Space close it through the click. Escape on the
 * Trigger before the menu is shown, as right after an opening key, closes it and is consumed
 * there.
 *
 * The Trigger is disabled while the Menu or its own Options are: its composed `ogButton` sets
 * `aria-disabled="true"`, `data-disabled` and native `disabled` unless `focusableWhenDisabled`,
 * and opening is ignored. Becoming disabled closes an open menu. Requires a nearest Menu root; a
 * second mounted Trigger fails. The
 * consumer supplies the accessible name, such as `aria-label` on an icon button; the Trigger's
 * name is also the menu's.
 *
 * Inside an `ogToolbar` it stays a Toolbar control only through a Toolbar variant; don't apply
 * another button primitive to the same button.
 */
@Directive({
  selector: "button[ogMenuTrigger]",
  exportAs: "ogMenuTrigger",
  hostDirectives: [OrigamiPopoverTrigger, OrigamiPopoverAnchor],
  providers: [
    OrigamiMenuTriggerOptions.provideExisting(() => OrigamiMenuTrigger),
    OrigamiPopoverTriggerOptions.provideFactory(() => inject(OrigamiMenuTriggerOptions)),
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(OrigamiMenuTriggerOptions).id,
    })),
  ],
  host: {
    "aria-haspopup": "menu",
    "(keydown)": "keydown($event)",
    "(keyup)": "keyup($event)",
    "(blur)": "blurred()",
    "(click)": "clicked()",
    "(pointerdown)": "pressed()",
  },
})
export class OrigamiMenuTrigger implements OrigamiMenuTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("menu-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** The Menu root's readonly State. */
  readonly state = inject(OrigamiMenuState);

  readonly #options = injectDeferred(OrigamiMenuTriggerOptions);
  readonly #context = inject(MenuContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;
  /**
   * The Space press this Trigger handled and is still held on it: its keyup must not click the
   * button. Only that press's own keyup is consumed.
   */
  #space = false;

  /** Menu or own disabled policy, the opening guard. */
  readonly #effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });

    // Disabling this Trigger closes an open menu; the root closes it for the Menu's disabled.
    let wasDisabled: boolean | null = null;

    effect(() => {
      const disabled = this.#options().disabled();

      if (wasDisabled === false && disabled) {
        untracked(() => this.#context.close());
      }

      wasDisabled = disabled;
    });

    // A close ends the handled press's guard too: a later Space is a press of its own.
    effect(() => {
      if (!this.#context.open()) {
        this.#space = false;
      }
    });
  }

  /** @internal Registers with the Menu once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerTrigger(
      { element: this.#element, id: computed(() => this.#options().id()) },
      this.#destroyRef,
    );
  }

  /** @internal The opening keys, and Enter and Space during an opening. Handled keys prevent their default, which keeps Enter and Space from clicking the button. */
  protected keydown(event: KeyboardEvent): void {
    // Every Space press decides for itself: one this Trigger leaves to the button clicks natively.
    if (event.key === " ") {
      this.#space = false;
    }

    if (
      this.#destroyed ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.#effectiveDisabled()
    ) {
      return;
    }

    const key = event.key;

    // A presented menu is a Popover layer, which takes Escape; one opened in this frame isn't yet,
    // so the Trigger closes it and consumes the key, which no enclosing layer then takes.
    if (key === "Escape") {
      if (this.#context.open() && !this.#context.participating()) {
        event.preventDefault();
        this.#context.close();
      }

      return;
    }

    const activating = key === "Enter" || key === " ";

    // An opening whose item hasn't taken focus yet keeps going: the button's click would close it.
    if (activating && this.#context.open() && this.#context.entry() !== null) {
      event.preventDefault();
      this.#context.keyed();

      if (key === " ") {
        this.#space = true;
      }

      return;
    }

    let edge: "first" | "last" | null = null;

    if (key === "ArrowDown") {
      edge = "first";
    } else if (key === "ArrowUp") {
      edge = "last";
    } else if (activating && !this.#context.open()) {
      edge = "first";
    }

    if (edge === null) {
      return;
    }

    event.preventDefault();
    this.#context.keyed();
    this.#context.enter(edge);

    if (key === " ") {
      this.#space = true;
    }
  }

  /** @internal A handled Space would click the button on keyup in some engines. */
  protected keyup(event: KeyboardEvent): void {
    if (event.key === " " && this.#space) {
      this.#space = false;
      event.preventDefault();
    }
  }

  /** @internal A handled Space released after focus left, such as on the item it focused, ends there. */
  protected blurred(): void {
    this.#space = false;
  }

  /** @internal A press is pointer input: hover may move focus in the menu again. */
  protected pressed(): void {
    this.#context.pointed();
  }

  /**
   * @internal Runs after the composed Popover Trigger toggled the menu. A click that opened it went
   * through the menu's opening, which requests the first item. One that closed it focuses the
   * Trigger when the engine didn't (macOS Safari), unless focus went elsewhere.
   */
  protected clicked(): void {
    if (this.#destroyed || this.#effectiveDisabled() || this.#context.open()) {
      return;
    }

    const document = this.#element.ownerDocument;
    const focused = document.activeElement;

    if (focused === null || focused === document.body) {
      this.#element.focus();
    }
  }
}
