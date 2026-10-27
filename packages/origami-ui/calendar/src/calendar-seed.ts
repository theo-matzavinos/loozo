import { ElementRef, PLATFORM_ID, Service, inject } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { ɵcanonicalDay as canonicalDay } from "@loozo/origami-ui/utils";
import { localToday } from "./calendar-date";
import type { Weekday } from "./calendar-date";

function weekdayAttribute(value: string | null): Weekday | null {
  switch (value) {
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    case "5":
      return 5;
    case "6":
      return 6;
    case "7":
      return 7;
  }

  return null;
}

/**
 * @internal A Calendar root's SSR seed (D5): the default today and the locale's week start, which
 * change the grid's markup and could differ between server and browser (time zone, midnight,
 * `Intl` week data). The root writes both to its host as `data-today` and `data-week-start`. In
 * the browser, a root whose own host already carries them, as a hydrating root's server element
 * does, reads them when it is created, as `injectUniqueId` reads a rendered ID, and keeps them for
 * its lifetime; otherwise, and on the server, today is the platform's clock in its own time zone
 * and the week start comes from the locale. Provided by each root.
 */
@Service({ autoProvided: false })
export class CalendarSeed {
  /** The default today: the seeded day while hydrating, else the platform's. */
  readonly today: string;
  /** The seeded week start while hydrating, else null: the locale decides. */
  readonly weekStart: Weekday | null;

  constructor() {
    const host = inject<ElementRef<unknown>>(ElementRef).nativeElement;

    if (isPlatformServer(inject(PLATFORM_ID)) || !(host instanceof Element)) {
      this.today = localToday();
      this.weekStart = null;

      return;
    }

    this.today = canonicalDay(host.getAttribute("data-today")) ?? localToday();
    this.weekStart = weekdayAttribute(host.getAttribute("data-week-start"));
  }
}
