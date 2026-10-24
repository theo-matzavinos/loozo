import {
  DestroyRef,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiPopoverAnchor,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverTrigger,
  OrigamiPopoverTriggerOptions,
} from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { OrigamiSelectState } from "./select";
import { SelectContext } from "./select-context";

/** Substitutable Trigger identity and disabled policy; it supplies the composed Popover Trigger's and Anchor's Options. */
export abstract class OrigamiSelectTriggerOptions {
  /** Effective reactive DOM ID. Generated identity is only the direct directive's default. */
  abstract readonly id: Signal<string>;
  /**
   * Blocks this Trigger's user opening, combined with the Select's disabled; direct default
   * false. Like the root's, it doesn't block authoritative writes.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the Trigger is disabled, by the Select or its own Options, it stays focusable:
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
    type: () => Type<OrigamiSelectTriggerOptions> | AbstractType<OrigamiSelectTriggerOptions>,
  ): Provider {
    return { provide: OrigamiSelectTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire Trigger Options configuration without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`, `disabled` and
   *   `focusableWhenDisabled`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiSelectTriggerOptions): Provider {
    return { provide: OrigamiSelectTriggerOptions, useFactory: factory };
  }
}

/** A key that types a character: one code point, such as a letter, digit or symbol. */
function printable(key: string): boolean {
  return key !== " " && /^.$/su.test(key);
}

/**
 * The Select's Trigger: a native `type="button"` with `role="combobox"`, which keeps focus while
 * the list is open. It composes the Popover Trigger and Anchor, so the list is positioned against
 * it, `aria-expanded` reports whether the list participates and `aria-controls` names mounted
 * Content. `aria-activedescendant` names the active option while the list participates, and
 * `data-placeholder` is present while nothing is selected.
 *
 * Keys, with Alt, Ctrl and Meta ignored, as are keys already `defaultPrevented` and keys during
 * IME composition. Closed: Enter, Space, ArrowDown and ArrowUp open with the selected option
 * active, else the first enabled one; Home and End open on the first or last enabled option; a
 * character opens on the first enabled option it starts. Open: ArrowDown and ArrowUp move to the
 * next or previous enabled option without wrapping; Home and End to the first and last; PageDown
 * and PageUp ten enabled options; characters typed within 500 ms search option labels (an
 * option's `label`, else its text), and repeating one character cycles; Space joins a running
 * search, otherwise Space and Enter choose the active option and close; Tab closes without
 * choosing and moves focus on; Escape closes without choosing. A click toggles the list and
 * focuses the Trigger, which macOS Safari doesn't do on its own.
 *
 * The Trigger is disabled while the Select or its own Options are: its composed `ogButton` sets
 * `aria-disabled="true"`, `data-disabled` and native `disabled` unless `focusableWhenDisabled`,
 * and opening is ignored. Requires a nearest Select root; a second mounted Trigger fails. The
 * consumer supplies the accessible name (`aria-label` or `aria-labelledby`) and the text, such
 * as the selected option's label or a placeholder.
 */
@Directive({
  selector: "button[ogSelectTrigger]",
  exportAs: "ogSelectTrigger",
  hostDirectives: [OrigamiPopoverTrigger, OrigamiPopoverAnchor],
  providers: [
    OrigamiSelectTriggerOptions.provideExisting(() => OrigamiSelectTrigger),
    OrigamiPopoverTriggerOptions.provideFactory(() => inject(OrigamiSelectTriggerOptions)),
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(OrigamiSelectTriggerOptions).id,
    })),
  ],
  host: {
    role: "combobox",
    "[attr.aria-activedescendant]": "activeDescendant()",
    "[attr.data-placeholder]": "placeholder()",
    "(keydown)": "keydown($event)",
    "(keyup)": "keyup($event)",
    "(click)": "clicked()",
  },
})
export class OrigamiSelectTrigger implements OrigamiSelectTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("select-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled Trigger focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });
  /** The Select root's readonly State. */
  readonly state = inject(OrigamiSelectState);

  readonly #options = injectDeferred(OrigamiSelectTriggerOptions);
  readonly #context = inject(SelectContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #destroyed = false;
  /** A Space keydown this Trigger handled: its keyup must not click the button. */
  #space = false;

  /** Select or own disabled policy, the opening guard. */
  readonly #effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  /** @internal The active option's ID while the list participates. */
  protected readonly activeDescendant = this.#context.activeDescendant;
  /** @internal Present while nothing is selected. */
  protected readonly placeholder = computed(() => {
    if (this.#context.empty()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal The Select's keys. Handled keys prevent their default, which also keeps Enter and
   * Space from clicking the button, so the composed Popover Trigger never toggles the list again.
   */
  protected keydown(event: KeyboardEvent): void {
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

    if (this.#context.open()) {
      this.#openKey(event);
    } else {
      this.#closedKey(event);
    }

    if (event.key === " " && event.defaultPrevented) {
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

  /**
   * @internal Runs after the composed Popover Trigger toggled the list: focuses the Trigger, and
   * a list it opened starts on the selected option.
   */
  protected clicked(): void {
    if (this.#destroyed || this.#effectiveDisabled()) {
      return;
    }

    if (this.#element.ownerDocument.activeElement !== this.#element) {
      this.#element.focus();
    }

    this.#context.opened();
  }

  #closedKey(event: KeyboardEvent): void {
    const key = event.key;

    if (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      this.#context.openAt("selected");

      return;
    }

    if (key === "Home" || key === "End") {
      event.preventDefault();

      if (key === "Home") {
        this.#context.openAt("first");
      } else {
        this.#context.openAt("last");
      }

      return;
    }

    if (printable(key)) {
      event.preventDefault();
      this.#context.openWithTypeahead(key, event.timeStamp);
    }
  }

  #openKey(event: KeyboardEvent): void {
    const key = event.key;

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        this.#context.move("next");

        return;
      case "ArrowUp":
        event.preventDefault();
        this.#context.move("previous");

        return;
      case "Home":
        event.preventDefault();
        this.#context.move("first");

        return;
      case "End":
        event.preventDefault();
        this.#context.move("last");

        return;
      case "PageDown":
        event.preventDefault();
        this.#context.move("pageDown");

        return;
      case "PageUp":
        event.preventDefault();
        this.#context.move("pageUp");

        return;
      case "Enter":
        event.preventDefault();
        this.#context.choose();

        return;
      case " ":
        event.preventDefault();

        if (this.#context.typeaheadRunning(event.timeStamp)) {
          this.#context.typeahead(key, event.timeStamp);
        } else {
          this.#context.choose();
        }

        return;
      case "Tab":
        this.#context.close();

        return;
      case "Escape":
        // A presented list is a Popover layer, which takes Escape; one opened in this frame isn't
        // yet, so the Trigger closes it and consumes the key, which no enclosing layer then takes.
        if (!this.#context.participating()) {
          event.preventDefault();
          this.#context.close();
        }

        return;
    }

    if (printable(key)) {
      event.preventDefault();
      this.#context.typeahead(key, event.timeStamp);
    }
  }
}
