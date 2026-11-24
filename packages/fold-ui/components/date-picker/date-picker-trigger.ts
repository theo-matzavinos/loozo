import { Component, computed, inject, input } from "@angular/core";
import { OrigamiDateFieldInput } from "@loozo/origami-ui/date-field";
import { OrigamiDatePickerTrigger } from "@loozo/origami-ui/date-picker";
import { LucideCalendar } from "@lucide/angular";
import { cn } from "../cn";
import { DatePickerRoot } from "./date-picker-root";

/**
 * The button that opens a DatePicker's popup. Write it inside a fold picker root: DatePicker,
 * DatePickerMultiple, DatePickerRange, MonthPicker or DateTimePicker. Its shape follows where you
 * write it, read once when it's created:
 *
 * - inside a DateFieldInput (field shape): a 28px ghost square with a calendar icon at the box's
 *   end. Write no text; its `aria-label` is its only name and the popup's, so name the field in
 *   it: "Choose due date".
 * - alone (button shape): Select's trigger with a trailing calendar icon, showing the text you
 *   write, such as the date through `DatePipe`. It's the Field's control, labelled by the Field's
 *   label. fold marks it `data-placeholder` while the value is empty (null, or no days) and
 *   `data-readonly` while the picker is readonly, however readonly was set.
 */
@Component({
  selector: "button[fold__DatePickerTrigger]",
  imports: [LucideCalendar],
  hostDirectives: [
    { directive: OrigamiDatePickerTrigger, inputs: ["id", "disabled", "focusableWhenDisabled"] },
  ],
  host: {
    "data-slot": "date-picker-trigger",
    "[attr.data-placeholder]": "placeholder()",
    "[attr.data-readonly]": "readonlyMarker()",
    "[class]": "classes()",
  },
  template: `
    @if (!fieldShape) {
      <span data-slot="date-picker-value" class="min-w-0 flex-1 truncate"><ng-content /></span>
    }
    <svg lucideCalendar aria-hidden="true" data-slot="date-picker-icon"></svg>
  `,
})
export class DatePickerTrigger {
  readonly class = input("");

  /** Inside a DateFieldInput: Origami's own rule, read once at construction. */
  protected readonly fieldShape = inject(OrigamiDateFieldInput, { optional: true }) !== null;

  readonly #root = inject(DatePickerRoot);

  // Presence attributes, "" or absent, never "false". The field shape shows both through its
  // segments, so it has neither.
  protected readonly placeholder = computed(() => {
    if (this.fieldShape) {
      return null;
    }

    const value = this.#root.state.value();

    if (value === null || (Array.isArray(value) && value.length === 0)) {
      return "";
    }

    return null;
  });
  protected readonly readonlyMarker = computed(() => {
    if (!this.fieldShape && this.#root.state.readonly()) {
      return "";
    }

    return null;
  });

  protected readonly classes = computed(() => {
    if (this.fieldShape) {
      return cn(
        "ms-auto inline-grid size-7 shrink-0 cursor-pointer place-items-center rounded-control-sm text-muted-foreground",
        "transition-[background-color,color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
        "not-data-disabled:hover:bg-foreground/8 not-data-disabled:hover:text-foreground not-data-disabled:active:bg-foreground/14",
        // Inset, so the ring stays inside the box's border.
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        // A disabled root dims the whole box, so the Trigger dims only in a box that isn't.
        "data-disabled:cursor-not-allowed [[data-slot=date-field-input]:not(:has([data-slot=date-field-segment][aria-disabled=true]))>&]:data-disabled:opacity-50",
        "forced-colors:data-disabled:text-[GrayText] [&>svg]:size-4",
        this.class(),
      );
    }

    return cn(
      "flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-control border border-input bg-surface px-2.5 text-start text-body text-foreground shadow-edge",
      "transition-[border-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      "hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
      // No base outline-none, so the ring's outline-style stays solid.
      "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      "aria-invalid:border-destructive-text",
      "data-placeholder:text-muted-foreground",
      // Readonly and disabled together keep the disabled cursor, whatever order Tailwind emits.
      "not-data-disabled:data-readonly:cursor-default data-readonly:border-dashed data-readonly:bg-transparent data-readonly:shadow-none",
      "data-disabled:cursor-not-allowed data-disabled:border-input data-disabled:opacity-50 data-disabled:shadow-none",
      "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
      // A focusable disabled trigger isn't natively disabled, so forced colors don't gray it.
      "forced-colors:data-disabled:text-[GrayText] forced-colors:data-disabled:[&>svg]:text-[GrayText]",
      this.class(),
    );
  });
}
