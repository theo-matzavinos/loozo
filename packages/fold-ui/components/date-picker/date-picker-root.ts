import type { Signal } from "@angular/core";

/**
 * What DatePickerTrigger reads from the fold picker root it opens. Each fold picker root
 * provides itself as this, so one trigger serves Origami's five State classes. A trigger under
 * no fold root has nothing to read and throws.
 */
export abstract class DatePickerRoot {
  abstract readonly state: {
    /** The root's effective value: a day, days, a range, a month or a date-time, or null. */
    readonly value: Signal<unknown>;
    readonly readonly: Signal<boolean>;
  };
}
