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
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { DateFieldContext } from "./date-field-context";
import type { DateFieldSegmentRegistration } from "./date-field-context";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";

/** Substitutable segment configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiDateFieldSegmentOptions {
  /** The unit this segment edits; required on the direct directive. */
  abstract readonly segment: Signal<OrigamiDateFieldSegmentType>;
  /**
   * The text shown while the unit is empty, or null (the direct directive's default) for one `–`
   * per digit of the unit's width: `––––` for a year, `––` otherwise.
   */
  abstract readonly placeholder: Signal<string | null>;

  /**
   * Replaces segment Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDateFieldSegmentOptions> | AbstractType<OrigamiDateFieldSegmentOptions>,
  ): Provider {
    return { provide: OrigamiDateFieldSegmentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire segment Options configuration without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `segment` and `placeholder`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiDateFieldSegmentOptions): Provider {
    return { provide: OrigamiDateFieldSegmentOptions, useFactory: factory };
  }
}

/**
 * Whether Angular is replaying an event that reached the server-rendered segment before it
 * hydrated. The browser already applied its default, which can no longer be prevented; the
 * replayed `input` puts the segment's own text back.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY;
}

/** Prevents a live event's default; a replayed one's already happened. */
function prevent(event: Event): void {
  if (!replayed(event)) {
    event.preventDefault();
  }
}

function flag(value: boolean): "true" | null {
  if (value) {
    return "true";
  }

  return null;
}

/**
 * One editable unit of a date field, usually a `<span>`: a `contenteditable` `role="spinbutton"`
 * that owns its text. Render one per unit part of the root's `state.segments()` and put no
 * content in it: it shows the unit's digits in the locale's numbering system, else its
 * placeholder, with an empty `data-placeholder` while empty.
 *
 * Typing: decimal digits (ASCII, the locale's own or full-width) fill the unit and focus moves on
 * once no further digit could fit (a month from 2, a day from 4, a year after four digits); a
 * leading zero waits for the next digit, and the first digit after the segment takes focus
 * replaces a filled unit. A 12-hour hour takes 1 to 12, a 24-hour one 0 to 23. The day period
 * takes the first letter of either of the locale's names (`a` or `p` in English, `π` or `μ` in
 * Greek), case-insensitively. ArrowUp and ArrowDown step the unit by one, wrapping within it
 * without changing another unit (the day period toggles); an empty unit starts at its minimum or
 * maximum, an empty year at this year. Home and End go to the unit's minimum and maximum (AM and
 * PM). ArrowLeft and ArrowRight move to the
 * previous and next segment in visual order (flipped in right-to-left text) and stop at the ends;
 * every segment is a Tab stop. Backspace removes the last digit, and on an empty unit moves to
 * the previous segment; Delete empties the unit. Pasting a whole value (`2026-10-27`, `09:30`) replaces
 * every unit; pasting digits fills this unit. Keys with Alt, Ctrl or Meta, keys already
 * `defaultPrevented` and keys during IME composition are ignored. A composition's text is typed
 * once, when it ends; nothing the browser inserts stays in the segment.
 *
 * ARIA: `aria-label` is the unit's localized name (`Intl.DisplayNames`); `aria-labelledby` names
 * the Input group's labels, from a Field or the group's own static `aria-labelledby`, then the
 * segment itself, so a screen reader hears "Date of birth, day"; absent while the group names
 * none. `aria-valuenow`, `aria-valuemin` and `aria-valuemax` follow the unit's value and bounds,
 * absent while it is empty; a month's `aria-valuetext` is its localized name, the day period's
 * its localized AM or PM (`aria-valuenow` 0 or 1). `aria-invalid` and `aria-required` follow the
 * Input group's Field. `inputmode="numeric"`, the day period's `"text"`, `enterkeyhint="next"`,
 * `spellcheck="false"` and `autocorrect="off"`. Readonly: it focuses and moves but never edits,
 * `aria-readonly="true"`, not `contenteditable`. Disabled: out of the tab order, not editable,
 * `aria-disabled="true"`.
 *
 * Requires a nearest date field root; it registers once Angular has set its inputs.
 */
@Directive({
  selector: "[ogDateFieldSegment]",
  providers: [OrigamiDateFieldSegmentOptions.provideExisting(() => OrigamiDateFieldSegment)],
  host: {
    role: "spinbutton",
    enterkeyhint: "next",
    spellcheck: "false",
    autocorrect: "off",
    "[attr.id]": "id",
    "[attr.inputmode]": "inputMode()",
    "[attr.contenteditable]": "editable()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-label]": "label()",
    "[attr.aria-labelledby]": "labelledBy()",
    "[attr.aria-valuenow]": "valueNow()",
    "[attr.aria-valuemin]": "valueMin()",
    "[attr.aria-valuemax]": "valueMax()",
    "[attr.aria-valuetext]": "valueText()",
    "[attr.aria-readonly]": "ariaReadonly()",
    "[attr.aria-disabled]": "ariaDisabled()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-required]": "ariaRequired()",
    "[attr.data-placeholder]": "placeholderAttribute()",
    "[textContent]": "text()",
    "(focus)": "focused()",
    "(beforeinput)": "beforeInput($event)",
    "(input)": "restore()",
    "(compositionstart)": "compositionStart()",
    "(compositionend)": "compositionEnd($event)",
    "(keydown)": "keydown($event)",
    "(paste)": "pasted($event)",
  },
})
export class OrigamiDateFieldSegment implements OrigamiDateFieldSegmentOptions {
  /**
   * Own required unit input, the directive's selector: `"year"`, `"month"` or `"day"` in a date
   * field; `"hour"`, `"minute"`, `"second"` or `"dayPeriod"` in a time field.
   */
  readonly segment = input.required<OrigamiDateFieldSegmentType>({ alias: "ogDateFieldSegment" });
  /** Own placeholder input, default null: one `–` per digit of the unit's width. */
  readonly placeholder = input<string | null>(null);

  readonly #options = injectDeferred(OrigamiDateFieldSegmentOptions);
  readonly #context = inject(DateFieldContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #registration: DateFieldSegmentRegistration = {
    element: this.#element,
    unit: () => this.#options().segment(),
  };
  /** @internal A static `id` from the template, else a generated one kept through hydration. */
  protected readonly id =
    inject(new HostAttributeToken("id"), { optional: true }) ??
    injectUniqueId("date-field-segment");

  /** A composition started and hasn't ended: its text is typed once, when it ends. */
  #composing = false;

  readonly #unit = computed(() => this.#options().segment());
  readonly #value = computed(() => this.#context.unitValue(this.#unit()));

  /** @internal The unit's digits, else the placeholder. */
  protected readonly text = computed(() =>
    this.#context.text(this.#unit(), this.#options().placeholder()),
  );
  /** @internal The unit's localized name. */
  protected readonly label = computed(() => this.#context.label(this.#unit()));
  /** @internal The Input group's labels, then this segment, absent while the group names none. */
  protected readonly labelledBy = computed(() => {
    const group = this.#context.group()?.labelledBy() ?? null;

    if (group === null) {
      return null;
    }

    return `${group} ${this.id}`;
  });
  /** @internal Numeric units take digits; the day period takes letters. */
  protected readonly inputMode = computed(() => {
    if (this.#unit() === "dayPeriod") {
      return "text";
    }

    return "numeric";
  });
  /** @internal Editable unless the root is disabled or readonly. */
  protected readonly editable = computed(() => {
    if (this.#context.disabled() || this.#context.readonly()) {
      return null;
    }

    return "true";
  });
  /** @internal Every segment is a tab stop unless the root is disabled. */
  protected readonly tabIndex = computed(() => {
    if (this.#context.disabled()) {
      return null;
    }

    return 0;
  });
  /** @internal */
  protected readonly valueNow = computed(() => this.#value()?.now ?? null);
  /** @internal */
  protected readonly valueMin = computed(() => this.#value()?.min ?? null);
  /** @internal */
  protected readonly valueMax = computed(() => this.#value()?.max ?? null);
  /** @internal */
  protected readonly valueText = computed(() => this.#value()?.text ?? null);
  /** @internal */
  protected readonly ariaReadonly = computed(() => flag(this.#context.readonly()));
  /** @internal */
  protected readonly ariaDisabled = computed(() => flag(this.#context.disabled()));
  /** @internal The Input group's Field shows its errors. */
  protected readonly ariaInvalid = computed(() => this.#context.group()?.invalid() ?? null);
  /** @internal The Input group's bound field is required. */
  protected readonly ariaRequired = computed(() => this.#context.group()?.required() ?? null);
  /** @internal Present while the unit is empty. */
  protected readonly placeholderAttribute = computed(() => {
    if (this.#context.empty(this.#unit())) {
      return "";
    }

    return null;
  });

  /** @internal Registers with the root once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerSegment(this.#registration, this.#destroyRef);
  }

  /** @internal Entering the segment: the next digit starts its unit over. */
  protected focused(): void {
    this.#context.entered();
  }

  /**
   * @internal Every edit arrives here and is cancelled, then applied to the draft. Composition
   * can't be cancelled: its text is typed once, at `compositionend`, and `restore` removes what the
   * browser inserted meanwhile.
   */
  protected beforeInput(event: Event): void {
    if (!(event instanceof InputEvent)) {
      return;
    }

    if (
      event.isComposing ||
      event.inputType === "insertCompositionText" ||
      event.inputType === "insertFromComposition"
    ) {
      return;
    }

    // A paste arrives as its own `paste` event too, which `pasted` handles.
    prevent(event);

    switch (event.inputType) {
      case "insertText":
      case "insertReplacementText":
        this.#context.type(this.#registration, event.data ?? "");

        return;
      case "deleteContentBackward":
        this.#context.backspace(this.#registration);

        return;
      case "deleteContentForward":
      case "deleteWordBackward":
      case "deleteWordForward":
      case "deleteByCut":
        this.#context.emptyUnit(this.#registration);

        return;
    }
  }

  /** @internal A composition started. */
  protected compositionStart(): void {
    this.#composing = true;
  }

  /**
   * @internal A composition ended: its text is typed once, after removing what it inserted. Gecko
   * ends a composition a second time when focus moves while the first `compositionend` runs, as
   * typing's advance does; only the first one types.
   */
  protected compositionEnd(event: CompositionEvent): void {
    this.restore();

    if (!this.#composing) {
      return;
    }

    this.#composing = false;
    this.#context.type(this.#registration, event.data);
  }

  /** @internal Puts the segment's own text back after an edit the browser applied anyway. */
  protected restore(): void {
    const text = this.text();

    if (this.#element.textContent !== text) {
      this.#element.textContent = text;
    }
  }

  /** @internal Paste: the clipboard's text, never inserted as is. */
  protected pasted(event: ClipboardEvent): void {
    prevent(event);
    this.#context.paste(this.#registration, event.clipboardData?.getData("text/plain") ?? "");
  }

  /**
   * @internal The segment's keys; handled keys prevent their default. A replayed Backspace or
   * Delete already edited the segment natively, and its replayed `beforeinput` applies it.
   */
  protected keydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (replayed(event) && (event.key === "Backspace" || event.key === "Delete")) {
      return;
    }

    switch (event.key) {
      case "ArrowUp":
        prevent(event);
        this.#context.step(this.#registration, 1);

        return;
      case "ArrowDown":
        prevent(event);
        this.#context.step(this.#registration, -1);

        return;
      case "Home":
        prevent(event);
        this.#context.edge(this.#registration, "min");

        return;
      case "End":
        prevent(event);
        this.#context.edge(this.#registration, "max");

        return;
      case "ArrowLeft":
      case "ArrowRight":
        prevent(event);
        this.#context.move(
          this.#registration,
          event.key,
          getComputedStyle(this.#element).direction === "rtl",
        );

        return;
      case "Backspace":
        prevent(event);
        this.#context.backspace(this.#registration);

        return;
      case "Delete":
        prevent(event);
        this.#context.emptyUnit(this.#registration);

        return;
    }
  }
}
