import { Component, computed, inject } from "@angular/core";
import {
  OrigamiCalendarHeading,
  OrigamiCalendarNext,
  OrigamiCalendarPrevious,
} from "@loozo/origami-ui/calendar";
import { LucideChevronDown, LucideChevronLeft, LucideChevronRight } from "@lucide/angular";
import { Button, buttonVariants } from "../button";
import { CALENDAR_LABELS } from "./calendar-labels";
import { CalendarRoot } from "./calendar-root";

/**
 * A Calendar's 32px header row, rendered by every root: ghost ‹ and › buttons around a ghost view
 * switch that shows the heading. Origami's live Heading is a visually hidden sibling, outside any
 * button, so screen readers announce it and it names the grid.
 */
@Component({
  selector: "div[fold__CalendarHeader]",
  imports: [
    Button,
    LucideChevronDown,
    LucideChevronLeft,
    LucideChevronRight,
    OrigamiCalendarHeading,
    OrigamiCalendarNext,
    OrigamiCalendarPrevious,
  ],
  host: { "data-slot": "calendar-header", class: "flex h-8 items-center gap-0.5" },
  // The switch's name is one string: a visible text plus a hidden suffix gets a space before the
  // comma from accessible-name computation.
  template: `
    <button
      ogCalendarPrevious
      data-slot="calendar-previous"
      [class]="stepClasses"
      [attr.aria-label]="labels.previous[root.state.view()]"
    >
      <svg lucideChevronLeft aria-hidden="true" class="[&:dir(rtl)]:rotate-180"></svg>
    </button>
    <span ogCalendarHeading data-slot="calendar-heading" class="sr-only">{{
      root.state.heading()
    }}</span>
    <button
      fold__Button
      variant="ghost"
      data-slot="calendar-view-switch"
      class="min-w-0 flex-1 px-1"
      [disabled]="root.state.disabled()"
      [attr.aria-label]="switchName()"
      (click)="root.setView(nextLevel())"
    >
      <span class="truncate">{{ root.state.heading() }}</span>
      <svg
        lucideChevronDown
        aria-hidden="true"
        [class.rotate-180]="nextLevel() === root.levels[0]"
      ></svg>
    </button>
    <button
      ogCalendarNext
      data-slot="calendar-next"
      [class]="stepClasses"
      [attr.aria-label]="labels.next[root.state.view()]"
    >
      <svg lucideChevronRight aria-hidden="true" class="[&:dir(rtl)]:rotate-180"></svg>
    </button>
  `,
})
export class CalendarHeader {
  protected readonly root = inject(CalendarRoot);
  protected readonly labels = inject(CALENDAR_LABELS);
  protected readonly stepClasses = buttonVariants({ variant: "ghost", size: "icon" });

  /** The view the switch shows next: the next coarser one, and the finest after the coarsest. */
  protected readonly nextLevel = computed(() => {
    const levels = this.root.levels;
    const index = levels.indexOf(this.root.state.view());

    return levels[(index + 1) % levels.length];
  });

  protected readonly switchName = computed(
    () => `${this.root.state.heading()}, ${this.labels.show[this.nextLevel()]}`,
  );
}
