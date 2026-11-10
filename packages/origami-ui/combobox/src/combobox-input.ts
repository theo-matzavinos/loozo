import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  Injector,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { OrigamiPopoverAnchor, OrigamiPopoverAnchorOptions } from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { ComboboxContext } from "./combobox-context";

/** Substitutable input identity; it supplies the composed Popover Anchor's Options. */
export abstract class OrigamiComboboxInputOptions {
  /**
   * Effective reactive DOM ID, also the composed Popover Anchor's; a Field's `<label for>` names
   * it. Generated identity is only the direct directive's default.
   */
  abstract readonly id: Signal<string>;

  /**
   * Replaces input Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiComboboxInputOptions> | AbstractType<OrigamiComboboxInputOptions>,
  ): Provider {
    return { provide: OrigamiComboboxInputOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the input Options without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiComboboxInputOptions): Provider {
    return { provide: OrigamiComboboxInputOptions, useFactory: factory };
  }
}

/**
 * The input of an `ogCombobox`: a native `<input>` with `role="combobox"`,
 * `aria-autocomplete="list"` and `autocomplete="off"` (a value written in the template wins), which
 * keeps focus while the list is open. It composes the Popover Anchor, so the list is positioned
 * against it. `aria-expanded` reports whether the list participates, `aria-controls` names mounted
 * Content and `aria-activedescendant` the highlighted option while the list participates. Its
 * `value` is the root's `query`; typing, pasting and deleting write `query`, open the list and
 * clear the highlight, and emptying the input also writes the value null.
 *
 * Keys, with Ctrl and Meta ignored, as are keys already `defaultPrevented`, keys during IME
 * composition and keys while disabled; Alt only with ArrowDown and ArrowUp. Closed: ArrowDown and
 * ArrowUp open with the selected option highlighted, else the first or last enabled one;
 * Alt+ArrowDown opens with nothing highlighted; Enter and Escape aren't handled. Open: ArrowDown
 * and ArrowUp move to the next or previous enabled option without wrapping, starting from the
 * selected option, else the first or last; PageDown and PageUp ten enabled options; Enter chooses
 * the highlighted option and, with nothing highlighted, is prevented and does nothing, so it never
 * submits a form mid-search; Alt+ArrowUp, Escape and Tab close without a choice. Home, End, Left,
 * Right and Space stay native text editing. Clicking or focusing the input doesn't open the list.
 * Focus leaving it is the root's `touch`; focus moving to another element also closes the list
 * without a choice, while focus falling to nothing, as when another window takes it or a script
 * calls `blur()`, keeps the list open and the text as it is.
 *
 * After each render, outside an IME composition, the input shows `query`, also when the consumer,
 * from `queryChange` or later before that render, wrote back the text the input showed before an
 * edit. During a composition the keys, choosing and every write of `query` into the input wait
 * for it to end. Text typed into the server-rendered input before hydration is kept: the input
 * reads it once Angular has set its inputs and adopts it as `query`, without choosing, committing
 * or opening; an `input` event before then, between the input's creation and its first update, is
 * ignored and leaves its text for that adoption.
 *
 * It is the control of its nearest `ogField`, governed by the `[formField]` on the Combobox root,
 * and registers with the Field and the root once Angular has set its inputs: the Field's
 * `<label for>` names it, its `aria-describedby` names the Field's Descriptions, then its mounted
 * Errors, `aria-invalid="true"` follows the Field's shown errors and `aria-required="true"` the
 * bound field, and it is natively `readonly` while the bound field is readonly. Outside a Field,
 * name it yourself with `aria-label` or `aria-labelledby`. Requires a nearest Combobox root; a
 * second mounted input fails. It has no `state`: read the root's.
 */
@Directive({
  selector: "input[ogComboboxInput]",
  exportAs: "ogComboboxInput",
  hostDirectives: [OrigamiPopoverAnchor, ɵOrigamiDescribedBy],
  providers: [
    OrigamiComboboxInputOptions.provideExisting(() => OrigamiComboboxInput),
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(OrigamiComboboxInputOptions).id,
    })),
  ],
  host: {
    role: "combobox",
    "aria-autocomplete": "list",
    autocomplete: "off",
    "[value]": "shown()",
    "[disabled]": "disabled()",
    "[readOnly]": "readonly()",
    "[attr.aria-expanded]": "expanded()",
    "[attr.aria-controls]": "controls()",
    "[attr.aria-activedescendant]": "activeDescendant()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-required]": "ariaRequired()",
    "(input)": "edited()",
    "(keydown)": "keydown($event)",
    "(blur)": "blurred($event)",
    "(compositionstart)": "composition(true)",
    "(compositionend)": "composition(false)",
  },
})
export class OrigamiComboboxInput implements OrigamiComboboxInputOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("combobox-input"));

  readonly #options = injectDeferred(OrigamiComboboxInputOptions);
  readonly #context = inject(ComboboxContext);
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #injector = inject(Injector);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#options().id(), {
    labelable: true,
    formState: () => this.#context.formState(),
  });
  /** The template's static `aria-label`, which also names a list without its own name. */
  readonly #staticLabel = inject(new HostAttributeToken("aria-label"), { optional: true });
  /** An IME composition started and hasn't ended. */
  readonly #composing = signal(false);
  /** `ngOnInit` ran: Angular has set the root's inputs, so edits may run the text policy. */
  #initialized = false;
  #destroyed = false;

  /**
   * @internal The input's `value`: the root's query, held at the text the input has while a
   * composition runs, so no write reaches the input until it ends.
   */
  protected readonly shown = computed(() => {
    if (this.#composing()) {
      return untracked(() => this.#element.value);
    }

    return this.#context.query();
  });
  /** @internal Natively disabled with the root. */
  protected readonly disabled = this.#context.disabled;
  /** @internal Natively readonly while the bound field is. */
  protected readonly readonly = computed(() => this.#context.formState()?.readonly() ?? false);
  /** @internal The list's participation. */
  protected readonly expanded = computed(() => String(this.#context.participating()));
  /** @internal Mounted Content's ID. */
  protected readonly controls = this.#context.contentId;
  /** @internal The highlighted option's ID while the list participates. */
  protected readonly activeDescendant = this.#context.activeDescendant;
  /** @internal The Field's shown errors inside a Field; otherwise the static value. */
  protected readonly ariaInvalid = this.#membership.invalid;
  /** @internal The bound field's `required()` inside a Field; otherwise the static value. */
  protected readonly ariaRequired = this.#membership.required;

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal Adopts text typed before hydration, starts reconciling the input's text with the
   * query, then joins the nearest Field and registers with the Combobox once Angular has set its
   * inputs, before the first `[value]` write. Does nothing when an earlier hook already destroyed
   * the input's view: Angular still calls this, and the view takes no after-render effect.
   */
  ngOnInit(): void {
    if (this.#destroyed) {
      return;
    }

    // Under hydration the element holds what was typed into the server's input, which the first
    // `[value]` write would replace; the server's `value` attribute is what it rendered. Read here,
    // not at construction: a key typed in between left its text in the element, and a construction
    // snapshot would drop it.
    const draft = this.#element.value;

    if (this.#browser && draft !== (this.#element.getAttribute("value") ?? "")) {
      this.#context.adopt(draft);
    }

    this.#initialized = true;
    this.#reconcileAfterRenders();

    this.#membership.register(this.#destroyRef);
    this.#context.registerInput(
      {
        element: this.#element,
        labelledBy: this.#membership.labelledBy,
        label: this.#staticLabel,
        composing: this.#composing.asReadonly(),
      },
      this.#destroyRef,
    );
  }

  /**
   * @internal Typing, pasting or deleting changed the text. Ignored before `ngOnInit`: the root's
   * inputs aren't set yet, so the text policy would read and write its defaults, and the text
   * stays in the element for adoption.
   */
  protected edited(): void {
    if (this.#initialized && !this.#destroyed) {
      this.#context.edited(this.#element.value);
    }
  }

  /**
   * @internal Focus left the input, to another element or to nothing (another window). Ignored
   * before `ngOnInit`, like an edit: the root's inputs aren't set yet.
   */
  protected blurred(event: FocusEvent): void {
    if (this.#initialized && !this.#destroyed) {
      this.#context.left(event.relatedTarget !== null);
    }
  }

  /**
   * @internal A composition started or ended. Its end releases the held `value` binding, and the
   * input is reconciled after the next render, so an engine's last `input` event, which may follow
   * `compositionend`, writes its own text first.
   */
  protected composition(composing: boolean): void {
    this.#composing.set(composing);
  }

  /**
   * @internal The Combobox's keys; handled keys prevent their default. Ignored before `ngOnInit`,
   * like an edit: the root's inputs aren't set yet.
   */
  protected keydown(event: KeyboardEvent): void {
    if (
      !this.#initialized ||
      this.#destroyed ||
      event.defaultPrevented ||
      event.isComposing ||
      this.#composing() ||
      event.ctrlKey ||
      event.metaKey ||
      this.#context.disabled()
    ) {
      return;
    }

    if (event.altKey) {
      this.#altKey(event);

      return;
    }

    if (this.#context.open()) {
      this.#openKey(event);
    } else {
      this.#closedKey(event);
    }
  }

  /**
   * Writes the query into the element after each render in which the query or the composition
   * changed, when its text differs, outside a composition. The `value` binding writes only a query
   * that differs from the last one it wrote, so it misses a native edit that the consumer undid,
   * from `queryChange` or later before the next render, by writing back the text it last wrote.
   * The query is read from the root's own signal, so a write that restores it still reruns this.
   */
  #reconcileAfterRenders(): void {
    afterRenderEffect(
      () => {
        const query = this.#context.query();

        if (!this.#composing() && !this.#destroyed && this.#element.value !== query) {
          this.#element.value = query;
        }
      },
      { injector: this.#injector },
    );
  }

  #altKey(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" && !this.#context.open()) {
      event.preventDefault();
      this.#context.openAt("none");

      return;
    }

    if (event.key === "ArrowUp" && this.#context.open()) {
      event.preventDefault();
      this.#context.close();
    }
  }

  #closedKey(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.#context.openAt("first");

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.#context.openAt("last");
    }
  }

  #openKey(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.#context.move("next");

        return;
      case "ArrowUp":
        event.preventDefault();
        this.#context.move("previous");

        return;
      case "PageDown":
        event.preventDefault();
        this.#context.move("pageDown");

        return;
      case "PageUp":
        event.preventDefault();
        this.#context.move("pageUp");

        return;
      case "Enter": {
        event.preventDefault();

        const active = this.#context.active();

        if (active !== null) {
          this.#context.choose(active);
        }

        return;
      }
      case "Tab":
        this.#context.close();

        return;
      case "Escape":
        // A presented list is a Popover layer, which takes Escape; one opened in this frame isn't
        // yet, so the input closes it and consumes the key, which no enclosing layer then takes.
        if (!this.#context.participating()) {
          event.preventDefault();
          this.#context.close();
        }

        return;
    }
  }
}
