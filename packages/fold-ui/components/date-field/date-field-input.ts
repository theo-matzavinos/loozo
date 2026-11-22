import { Component, computed, inject, input } from "@angular/core";
import {
  OrigamiDateFieldInput,
  OrigamiDateFieldSegment,
  OrigamiDateFieldState,
  type OrigamiDateFieldSegmentType,
} from "@loozo/origami-ui/date-field";
import { cn } from "../cn";
import { DATE_FIELD_PLACEHOLDERS } from "./date-field-placeholders";

const segmentTypes: readonly OrigamiDateFieldSegmentType[] = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "dayPeriod",
];

/**
 * The box of a DateField, TimeField or DateTimeField, or a DatePicker's field shape: Input's
 * 32px control drawn round the typed segments, which it renders in the locale's order with their
 * separators. Each segment sits in a cell as wide as its widest state, so nothing moves while you
 * type. A DatePickerTrigger written inside it sits at its end.
 *
 * It's the root's one Input: Origami gives it `role="group"` and, in a Field, the label's name.
 * Standalone, give it an `aria-label`.
 */
@Component({
  selector: "[fold__DateFieldInput]",
  imports: [OrigamiDateFieldSegment],
  hostDirectives: [OrigamiDateFieldInput],
  host: { "data-slot": "date-field-input", "[class]": "classes()" },
  template: `
    @for (part of field.segments(); track part.key) {
      @if (part.type === "literal") {
        <span aria-hidden="true" data-slot="date-field-literal" class="whitespace-pre">{{
          part.text
        }}</span>
      } @else {
        <span data-slot="date-field-cell" class="inline-grid">
          @for (line of sizerLines()[part.type]; track line) {
            <span
              aria-hidden="true"
              class="invisible col-start-1 row-start-1 px-0.5 whitespace-pre"
              >{{ line }}</span
            >
          }
          <span
            [ogDateFieldSegment]="part.type"
            [placeholder]="placeholders[part.type]"
            data-slot="date-field-segment"
            [class]="segmentClasses(part.type)"
          ></span>
        </span>
      }
    }
    <ng-content />
  `,
})
export class DateFieldInput {
  readonly class = input("");

  protected readonly field = inject(OrigamiDateFieldState);
  protected readonly placeholders = inject(DATE_FIELD_PLACEHOLDERS);

  /**
   * The invisible lines each unit's cell is sized by, one per line so the row stays one line
   * tall. Every two-digit cell is as wide as the field's widest two-character token or `00`, and
   * the year as that token followed by two digits, its own token or `0000`, so filled digit units
   * carry the same spare width and sit evenly between their separators. The day period reserves
   * its token's width.
   */
  protected readonly sizerLines = computed(() => {
    const pairs: string[] = [];

    for (const part of this.field.segments()) {
      if (part.type !== "literal" && part.type !== "year" && part.type !== "dayPeriod") {
        pairs.push(this.placeholders[part.type]);
      }
    }

    const years: string[] = [];

    for (const pair of pairs) {
      years.push(`${pair}00`);
    }

    const lines = {} as Record<OrigamiDateFieldSegmentType, readonly string[]>;

    for (const type of segmentTypes) {
      let candidates = [...pairs, "00"];

      if (type === "year") {
        candidates = [...years, this.placeholders.year, "0000"];
      }

      if (type === "dayPeriod") {
        candidates = [this.placeholders.dayPeriod];
      }

      lines[type] = [...new Set(candidates)];
    }

    return lines;
  });

  protected segmentClasses(type: OrigamiDateFieldSegmentType) {
    let alignment = "";

    // The day period hugs its text at the cell's start, so its spare width trails into the box.
    if (type === "dayPeriod") {
      alignment = "justify-self-start";
    }

    return cn(
      // The chip and the box's ring carry focus, so the contenteditable's own ring is off.
      "col-start-1 row-start-1 cursor-text rounded-checkbox px-0.5 text-center caret-transparent outline-none",
      alignment,
      "data-placeholder:not-focus:text-muted-foreground focus:bg-foreground focus:text-background",
      // A system color for every state, so the chip reads in forced colors.
      "forced-color-adjust-none forced-colors:text-[CanvasText] forced-colors:data-placeholder:not-focus:text-[GrayText]",
      "forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText] forced-colors:aria-disabled:text-[GrayText]",
    );
  }

  protected readonly classes = computed(() =>
    cn(
      "flex h-8 w-full min-w-0 items-center rounded-control border border-input bg-surface px-2.5 text-body text-foreground tabular-nums",
      "transition-[border-color] duration-120 ease-out motion-reduce:transition-none",
      "hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
      // No base outline-none, so the ring's outline-style stays solid.
      "has-[[data-slot=date-field-segment]:focus]:border-ring has-[[data-slot=date-field-segment]:focus]:outline-2 has-[[data-slot=date-field-segment]:focus]:outline-offset-2 has-[[data-slot=date-field-segment]:focus]:outline-ring",
      "has-[[data-slot=date-field-segment][aria-invalid=true]]:border-destructive-text",
      "has-[[data-slot=date-field-segment][aria-readonly=true]]:border-dashed has-[[data-slot=date-field-segment][aria-readonly=true]]:bg-transparent",
      "has-[[data-slot=date-field-segment][aria-disabled=true]]:cursor-not-allowed has-[[data-slot=date-field-segment][aria-disabled=true]]:border-input has-[[data-slot=date-field-segment][aria-disabled=true]]:opacity-50",
      // A DatePickerTrigger inside sits 1px inside the border, like NumberField's step buttons.
      "has-[>[data-slot=date-picker-trigger]]:pe-px",
      this.class(),
    ),
  );
}
