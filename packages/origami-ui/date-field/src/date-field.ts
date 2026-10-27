import {
  Directive,
  LOCALE_ID,
  Service,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
} from "@angular/core";
import type { Signal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl, ValidationError } from "@angular/forms/signals";
import { DateFieldContext } from "./date-field-context";
import type { OrigamiDateFieldPart } from "./date-field-context";
import { DateFieldDraft } from "./date-field-draft";
import { OrigamiDateFieldOptions } from "./date-field-options";
import { DateFieldRoot } from "./date-field-root";
import { dateValue } from "./date-value";

/** Locally provided readonly facade for the nearest date field root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiDateFieldState {
  readonly #context = inject(DateFieldContext);

  /** The effective committed value, including null and a value that isn't canonical. */
  readonly value: Signal<string | null> = this.#context.value;
  /**
   * The locale's layout: each unit and each literal between them in order, with the unit's
   * current text (its digits, else its default placeholder) and the literal's text. `en-US` is
   * month `/` day `/` year, `el` day `/` month `/` year. Render a segment per unit and the
   * literals as plain, `aria-hidden` text. A root that hydrates keeps the server's layout (its
   * `data-layout` seed) until `locale` changes.
   */
  readonly segments: Signal<readonly OrigamiDateFieldPart[]> = this.#context.segments;
  /**
   * The draft's parse errors, for use without Signal Forms: `{ kind: "dateIncomplete" }` while
   * some units are empty, `{ kind: "dateInvalid" }` for a complete draft that names no day (31
   * February), else none. `[formField]` on the root reports the same errors to the form. Origami
   * ships no messages.
   */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]> =
    this.#context.parseErrors;
  /** The root's effective disabled policy. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
  /** The root's effective readonly policy. */
  readonly readonly: Signal<boolean> = this.#context.readonly;
}

/**
 * Date field root: a civil date `YYYY-MM-DD`, typed as locale-ordered segments. The consumer
 * renders the markup from `state.segments()`: an `ogDateFieldInput` group holding an
 * `ogDateFieldSegment` per unit and the literals between them as plain `aria-hidden` text, in
 * the locale's order (`Intl.DateTimeFormat#formatToParts`, Gregorian). Origami computes the
 * order, the unit names, keys, focus and ARIA; it generates no markup.
 *
 * The value is a `YYYY-MM-DD` string or null, never a `Date`, so no time zone can shift it. A
 * half-typed draft is kept per root: a complete, real date commits at once; emptying every unit
 * commits null; anything else keeps the last value and reports a parse error, `dateIncomplete`
 * (`10/––/2026`) or `dateInvalid` (`02/31/2026`), shown as typed, never clamped. Writing the
 * value, a Signal Forms `reset()` included, replaces the draft; `reset()` also does so to the
 * value already committed. `clear()` discards the draft and commits null, also over a null value.
 * There are no bounds on the field: put them in the form schema.
 *
 * Server rendering and hydration: the root writes its resolved layout to its host as
 * `data-layout` (order, literals, unit names, digits). A hydrating root reads it from its server
 * element and keeps it until `locale` changes, so a browser whose `Intl` formats differently
 * still hydrates the server's markup; a root the browser creates lays out from its own `Intl`.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` and `readonly` inputs, listens to `touch`, which it emits when focus leaves its
 * `ogDateFieldInput`, not when it moves between segments, and receives the draft's parse errors.
 * `focusBoundControl()` calls `focus()`, which focuses the first segment. A consumer directive
 * that composes it through `hostDirectives` and is itself the `FormValueControl`, with its own
 * `value` model supplying these Options, is the control `[formField]` binds; the parse errors
 * still reach the form. Its `ogDateFieldInput` is the control of its nearest `ogField`.
 *
 * @example
 * ```html
 * <div ogDateField [(value)]="birthDate" #date="ogDateField">
 *   <div ogDateFieldInput aria-label="Date of birth">
 *     @for (part of date.state.segments(); track part.key) {
 *       @if (part.type === "literal") {
 *         <span aria-hidden="true">{{ part.text }}</span>
 *       } @else {
 *         <span [ogDateFieldSegment]="part.type"></span>
 *       }
 *     }
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogDateField]",
  exportAs: "ogDateField",
  providers: [
    OrigamiDateFieldOptions.provideExisting(() => OrigamiDateField),
    DateFieldRoot.provideFactory(() => {
      const options = inject(OrigamiDateFieldOptions);

      return {
        value: options.value,
        locale: options.locale,
        disabled: options.disabled,
        readonly: options.readonly,
        hourCycle: computed(() => null),
        shape: dateValue,
      };
    }),
    DateFieldDraft,
    DateFieldContext,
    OrigamiDateFieldState,
  ],
  host: { "[attr.data-layout]": "layout()" },
})
export class OrigamiDateField implements OrigamiDateFieldOptions, FormValueControl<string | null> {
  /**
   * Own value model, default null; `valueChange` emits values the user commits to this model,
   * and `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own locale input, default `LOCALE_ID`; replaced Options supply the effective locale instead. */
  readonly locale = input(inject(LOCALE_ID));
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `readonly()` rules. Replaced Options supply effective policy instead.
   */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiDateFieldState);

  readonly #context = inject(DateFieldContext);

  /**
   * Emits when focus leaves the root's `ogDateFieldInput`, not when it moves between segments;
   * `[formField]` marks its field touched.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /** @internal The resolved layout, the hydration seed. */
  protected readonly layout = this.#context.layoutAttribute;

  /**
   * Focuses the first segment in DOM order, or, before any segment is mounted, the first one to
   * mount once it renders; nothing while disabled. Signal Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the segment's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /**
   * Empties the field: discards the draft, half-typed units included, and the typing session, and
   * commits null to the effective value. `valueChange` emits, and Signal Forms sees the write,
   * only if the value wasn't null already; the parse errors clear and every segment shows its
   * placeholder. Writing null to `value` doesn't do this while the value is already null, since
   * nothing changes, and Signal Forms' `reset()` also resets touched and dirty. A programmatic
   * write: it applies whatever `disabled` and `readonly` say. A segment keeping focus starts its
   * unit over with the next digit.
   */
  clear(): void {
    this.#context.clear();
  }
}
