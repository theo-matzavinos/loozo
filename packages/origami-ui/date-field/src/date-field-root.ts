import type { Provider, Signal, WritableSignal } from "@angular/core";
import type { ParseResult } from "@angular/forms/signals";
import type { OrigamiDateFieldSegmentType } from "./date-field-segment-type";
import type { Draft } from "./date-field-unit";

/**
 * A root's value shape: which units it lays out and how its value and a draft convert. A
 * strategy each root supplies; the segment engine and the parts are shared.
 */
export interface DateFieldShape {
  /** The units the root lays out, without the day period, which the hour cycle adds. */
  readonly units: readonly OrigamiDateFieldSegmentType[];
  /** The draft that shows `value`; empty for null and for a value that isn't canonical. */
  format(value: string | null): Draft;
  /** The value a draft commits, or its parse error. */
  parse(draft: Draft): ParseResult<string | null>;
  /** `text` if it is a canonical value of this shape, else null; for paste. */
  canonical(text: string): string | null;
}

/**
 * @internal What the shared Context, Input and segments read from whichever root they belong to,
 * supplied by each root from its own public Options and shape. Package-private.
 */
export abstract class DateFieldRoot {
  /** The effective writable value. */
  abstract readonly value: WritableSignal<string | null>;
  abstract readonly locale: Signal<string>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly readonly: Signal<boolean>;
  /** 12 or 24 forces the hour cycle, null follows the locale; a date root has none. */
  abstract readonly hourCycle: Signal<12 | 24 | null>;
  abstract readonly shape: DateFieldShape;

  static provideFactory(factory: () => DateFieldRoot): Provider {
    return { provide: DateFieldRoot, useFactory: factory };
  }
}
