import {
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  Service,
  afterRenderEffect,
  computed,
  inject,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import type { Signal } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import { DateFieldDraft } from "./date-field-draft";
import { readLayout, resolveLayout, writeLayout } from "./date-field-layout";
import type { DateFieldLayout } from "./date-field-layout";
import { DateFieldRoot } from "./date-field-root";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import {
  digitValue,
  edgeUnit,
  eraseDigit,
  stepUnit,
  typeDigit,
  typePeriod,
  unitBounds,
  unitValue,
  unitWidth,
} from "./date-field-unit";
import type { Draft, DraftEntry, UnitContext } from "./date-field-unit";

/** One part of a root's layout with its current text, as State exposes it. */
export interface OrigamiDateFieldPart {
  /** The unit, or `literal-0`, `literal-1`, … by position among the literals. */
  readonly key: string;
  /** The unit this part edits, or `"literal"` for the text between units. */
  readonly type: OrigamiDateFieldSegmentType | "literal";
  /** The literal's text, or the unit's current text: its digits, else its default placeholder. */
  readonly text: string;
}

/** A mounted segment, registered from its `ngOnInit`. */
export interface DateFieldSegmentRegistration {
  readonly element: HTMLElement;
  /** The unit it edits, its effective Options'. */
  readonly unit: () => OrigamiDateFieldSegmentType;
}

/** The mounted Input group, registered from its `ngOnInit`; its Field membership's attributes. */
export interface DateFieldGroupRegistration {
  readonly element: HTMLElement;
  /** The group's `aria-labelledby`: the Field's Labels, else its static value. */
  readonly labelledBy: Signal<string | null>;
  /** `"true"` while the Field shows its errors, else the group's static value. */
  readonly invalid: Signal<string | null>;
  /** `"true"` while the bound field is required, else the group's static value. */
  readonly required: Signal<string | null>;
}

/** The ARIA value of one unit: absent while the unit is empty. */
export interface DateFieldUnitValue {
  readonly now: number;
  readonly min: number;
  readonly max: number;
  /** The month's localized name, the day period's; null for the other units. */
  readonly text: string | null;
}

/** The root's host seed (F6), unread: its own host's `data-layout` when it hydrates, else null. */
function hostSeed(): string | null {
  const host = inject<ElementRef<unknown>>(ElementRef).nativeElement;

  if (isPlatformServer(inject(PLATFORM_ID)) || !(host instanceof Element)) {
    return null;
  }

  return host.getAttribute("data-layout");
}

function domOrder(a: DateFieldSegmentRegistration, b: DateFieldSegmentRegistration): number {
  if (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }

  return 1;
}

/**
 * @internal A date field root's private behavior, shared by every root: the layout and its seed,
 * the draft's edits through the segment engine, the typing buffer, segment and Input
 * registrations, focus moves, `focus()` and the touch notification. Provided by each root; it
 * reads the root's Signal Forms binding (`FORM_FIELD` on the root's element).
 */
@Service({ autoProvided: false })
export class DateFieldContext {
  readonly #root = injectDeferred(DateFieldRoot);
  readonly #draftResolver = injectDeferred(DateFieldDraft);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #seed = hostSeed();
  readonly #segments = signal<readonly DateFieldSegmentRegistration[]>([]);
  readonly #group = signal<DateFieldGroupRegistration | null>(null);
  readonly #touches = new Subject<void>();
  /** A `focus()` made before any segment was mounted; applied after the render that mounts one. */
  readonly #request = signal<{ readonly options: FocusOptions | undefined } | null>(null);
  /**
   * The digits typed into the focused segment since it was entered, and the draft that typing
   * left; once anything else replaces the draft, the next digit starts the unit over.
   */
  #typing: {
    readonly segment: DateFieldSegmentRegistration;
    readonly typed: string;
    readonly draft: Draft;
  } | null = null;

  /** The layout: the seed while hydrating, until a later locale change; else the locale's. */
  readonly layout = linkedSignal<{ locale: string; hourCycle: 12 | 24 | null }, DateFieldLayout>({
    source: () => ({ locale: this.#root().locale(), hourCycle: this.#root().hourCycle() }),
    computation: (source, previous) => {
      const request = { units: this.#root().shape.units, hourCycle: source.hourCycle };

      if (previous === undefined) {
        const seed = readLayout(this.#seed, request);

        if (seed !== null) {
          return seed;
        }
      }

      return resolveLayout(source.locale, request);
    },
  });
  /** The layout for the root host's `data-layout`. */
  readonly layoutAttribute = computed(() => writeLayout(this.layout()));
  readonly value = computed(() => this.#root().value());
  readonly disabled = computed(() => this.#root().disabled());
  readonly readonly = computed(() => this.#root().readonly());
  readonly parseErrors = computed(() => this.#draft().parseErrors());
  /** The mounted Input group, or null. */
  readonly group = this.#group.asReadonly();
  readonly segments = computed<readonly OrigamiDateFieldPart[]>(() => {
    const parts: OrigamiDateFieldPart[] = [];
    let literals = 0;

    for (const part of this.layout().parts) {
      if (part.type === "literal") {
        parts.push({ key: `literal-${literals}`, type: "literal", text: part.text });
        literals += 1;
      } else {
        parts.push({ key: part.type, type: part.type, text: this.text(part.type, null) });
      }
    }

    return parts;
  });
  /** Emits synchronously when focus leaves the Input group; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  readonly #unitContext = computed<UnitContext>(() => ({
    hourCycle: this.layout().hourCycle ?? 24,
  }));
  readonly #monthNames = computed(() => {
    const format = new Intl.DateTimeFormat(this.layout().locale, {
      calendar: "gregory",
      timeZone: "UTC",
      month: "long",
    });
    const names: string[] = [];

    for (let month = 0; month < 12; month += 1) {
      names.push(format.format(Date.UTC(2001, month, 1)));
    }

    return names;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#touches.complete();
    });

    // Browser-only: render effects never run on the server.
    afterRenderEffect(() => {
      const request = this.#request();
      const first = this.#ordered()[0];

      if (request === null || first === undefined) {
        return;
      }

      untracked(() => {
        this.#request.set(null);

        if (!this.disabled()) {
          first.element.focus(request.options);
        }
      });
    });
  }

  /** The Signal Forms state bound on the root's element, or null without `[formField]`. */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /** A unit's localized name. */
  label(unit: OrigamiDateFieldSegmentType): string | null {
    return this.layout().labels[unit] ?? null;
  }

  /** Whether a unit is empty. */
  empty(unit: OrigamiDateFieldSegmentType): boolean {
    return this.#entry(unit) === "";
  }

  /**
   * A unit's text: its digits in the locale's numbering system (the day period's name), else
   * `placeholder`, else one `–` per digit of its width.
   */
  text(unit: OrigamiDateFieldSegmentType, placeholder: string | null): string {
    const entry = this.#entry(unit);

    if (entry === "") {
      return placeholder ?? "–".repeat(unitWidth(unit));
    }

    if (unit === "dayPeriod") {
      return this.#periodName(entry);
    }

    const digits = Array.from(this.layout().digits);
    let text = "";

    for (const digit of entry) {
      text += digits[Number(digit)];
    }

    return text;
  }

  /** A unit's ARIA value, or null while it holds none. */
  unitValue(unit: OrigamiDateFieldSegmentType): DateFieldUnitValue | null {
    const draft = this.#draft().value();
    const now = unitValue(unit, draft[unit] ?? "");

    if (now === null) {
      return null;
    }

    const { min, max } = unitBounds(unit, draft, this.#unitContext());
    let text: string | null = null;

    if (unit === "month") {
      text = this.#monthNames()[now - 1] ?? null;
    } else if (unit === "dayPeriod") {
      text = this.#periodName(draft[unit] ?? "");
    }

    return { now, min, max, text };
  }

  /** Registers a segment from its `ngOnInit`, unless its view is already destroyed. */
  registerSegment(segment: DateFieldSegmentRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#segments.update((segments) => [...segments, segment]);
    destroyRef.onDestroy(() => {
      const remaining: DateFieldSegmentRegistration[] = [];

      for (const mounted of this.#segments()) {
        if (mounted !== segment) {
          remaining.push(mounted);
        }
      }

      this.#segments.set(remaining);

      if (this.#typing?.segment === segment) {
        this.#typing = null;
      }
    });
  }

  /** Registers the Input group from its `ngOnInit`; a second mounted Input fails. */
  registerGroup(group: DateFieldGroupRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (untracked(this.#group) !== null) {
      throw new Error("Date field supports only one mounted Input.");
    }

    this.#group.set(group);
    destroyRef.onDestroy(() => {
      if (untracked(this.#group) === group) {
        this.#group.set(null);
      }
    });
  }

  /** A segment took focus: the next digit starts its unit over. */
  entered(): void {
    this.#typing = null;
  }

  /**
   * Types `data` into a segment: decimal digits into a numeric unit, a period's first letter into
   * the day period. Typing stops where the unit advances, moving focus to the next segment.
   */
  type(segment: DateFieldSegmentRegistration, data: string): void {
    if (!this.#editable()) {
      return;
    }

    const unit = segment.unit();

    for (const character of data) {
      let advance = false;

      if (unit === "dayPeriod") {
        const period = typePeriod(
          character,
          this.layout().periods ?? ["", ""],
          this.layout().locale,
        );

        if (period === null) {
          continue;
        }

        this.#set(unit, period);
        this.#typing = null;
        advance = true;
      } else {
        const digit = digitValue(character);

        if (digit === null) {
          continue;
        }

        let typed = "";

        if (this.#typing?.segment === segment && this.#typing.draft === this.#draft().value()) {
          typed = this.#typing.typed;
        }

        const result = typeDigit(unit, typed, String(digit), this.#unitContext());

        if (result === null) {
          continue;
        }

        this.#typing = { segment, typed: result.typed, draft: this.#set(unit, result.entry) };
        advance = result.advance;
      }

      if (advance) {
        this.#neighbour(segment, 1)?.element.focus();

        return;
      }
    }
  }

  /** Backspace: removes the unit's last digit; on an empty unit, focus moves to the previous one. */
  backspace(segment: DateFieldSegmentRegistration): void {
    if (!this.#editable()) {
      return;
    }

    const unit = segment.unit();
    const entry = this.#entry(unit);

    if (entry === "") {
      this.#neighbour(segment, -1)?.element.focus();

      return;
    }

    const result = eraseDigit(unit, entry, this.#unitContext());

    this.#typing = { segment, typed: result.typed, draft: this.#set(unit, result.entry) };
  }

  /** Delete: empties the unit. */
  emptyUnit(segment: DateFieldSegmentRegistration): void {
    if (!this.#editable()) {
      return;
    }

    this.#set(segment.unit(), "");
    this.#typing = null;
  }

  /**
   * The root's `clear()`: discards the draft and the typing session and commits null, whatever
   * the policies say. An empty draft parses to null, so the parser writes null to the effective
   * value, which emits only if it changes, and clears the parse errors.
   */
  clear(): void {
    this.#draft().value.set(this.#root().shape.format(null));
    this.#typing = null;
  }

  /** Up (+1) or Down (−1), wrapping within the unit; an empty year starts at this year. */
  step(segment: DateFieldSegmentRegistration, delta: 1 | -1): void {
    if (!this.#editable()) {
      return;
    }

    const unit = segment.unit();
    const draft = this.#draft().value();
    // The clock is read at the keypress, never at render.
    const entry = stepUnit(unit, draft, delta, this.#unitContext(), new Date().getFullYear());

    this.#set(unit, entry);
    this.#typing = null;
  }

  /** Home (the unit's minimum) or End (its maximum). */
  edge(segment: DateFieldSegmentRegistration, edge: "min" | "max"): void {
    if (!this.#editable()) {
      return;
    }

    const unit = segment.unit();

    this.#set(unit, edgeUnit(unit, this.#draft().value(), edge, this.#unitContext()));
    this.#typing = null;
  }

  /**
   * Left or Right: focus moves to the previous or next segment in visual order, `rtl` flipping
   * them, and stops at the ends.
   */
  move(segment: DateFieldSegmentRegistration, key: "ArrowLeft" | "ArrowRight", rtl: boolean): void {
    if ((key === "ArrowRight") !== rtl) {
      this.#neighbour(segment, 1)?.element.focus();
    } else {
      this.#neighbour(segment, -1)?.element.focus();
    }
  }

  /**
   * Paste: a whole canonical value replaces the draft at once; digits alone go into the focused
   * unit, without moving focus; anything else is ignored.
   */
  paste(segment: DateFieldSegmentRegistration, text: string): void {
    if (!this.#editable()) {
      return;
    }

    const trimmed = text.trim();
    const root = this.#root();
    const value = root.shape.canonical(trimmed);

    if (value !== null) {
      this.#draft().value.set(root.shape.format(value));
      this.#typing = null;

      return;
    }

    const unit = segment.unit();

    if (unit === "dayPeriod" || !/^\p{Nd}+$/u.test(trimmed)) {
      return;
    }

    let typed = "";
    let entry: DraftEntry | null = null;

    for (const character of trimmed) {
      const result = typeDigit(unit, typed, String(digitValue(character)), this.#unitContext());

      if (result !== null) {
        typed = result.typed;
        entry = result.entry;
      }
    }

    if (entry !== null) {
      this.#typing = { segment, typed, draft: this.#set(unit, entry) };
    }
  }

  /** Focus left the Input group. */
  left(): void {
    this.#touches.next();
  }

  /**
   * Focuses the first segment in DOM order, passing `options` to its native `focus()`; before any
   * segment is mounted, the first one to mount takes it after it renders. Nothing while disabled.
   */
  focus(options?: FocusOptions): void {
    if (this.disabled()) {
      return;
    }

    const first = this.#ordered()[0];

    if (first === undefined) {
      this.#request.set({ options });

      return;
    }

    first.element.focus(options);
  }

  #draft(): DateFieldDraft {
    // Created on first read, outside any reactive context: `transformedValue` writes Signal
    // Forms' parse-error source, which a render `computed` forbids (NG0600).
    return untracked(this.#draftResolver);
  }

  #entry(unit: OrigamiDateFieldSegmentType): DraftEntry {
    return this.#draft().value()[unit] ?? "";
  }

  /**
   * Writes a unit's entry and returns the draft it leaves: the written one, or the committed
   * value's, which a commit that changes the value derives in its place.
   */
  #set(unit: OrigamiDateFieldSegmentType, entry: DraftEntry): Draft {
    const draft = this.#draft().value;
    const next: Draft = { ...draft(), [unit]: entry };

    draft.set(next);

    return draft();
  }

  #periodName(entry: DraftEntry): string {
    const periods = this.layout().periods;

    if (periods === null) {
      return entry;
    }

    if (entry === "am") {
      return periods[0];
    }

    return periods[1];
  }

  #editable(): boolean {
    return !this.disabled() && !this.readonly();
  }

  #ordered(): DateFieldSegmentRegistration[] {
    return [...this.#segments()].sort(domOrder);
  }

  /** The segment `offset` places after `segment` in DOM order, or null past the ends. */
  #neighbour(
    segment: DateFieldSegmentRegistration,
    offset: 1 | -1,
  ): DateFieldSegmentRegistration | null {
    const ordered = this.#ordered();
    const index = ordered.indexOf(segment);

    return ordered[index + offset] ?? null;
  }
}
