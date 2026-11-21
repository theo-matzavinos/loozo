import { Service } from "@angular/core";
import type { ScrollAreaScrollbarPart } from "./scroll-area-context";

/**
 * @internal A Scrollbar's own slot for its Thumb, provided by each Scrollbar so a Thumb registers
 * with its nearest Scrollbar. The Scrollbar fills `part` at construction.
 */
@Service({ autoProvided: false })
export class ScrollAreaScrollbarContext {
  /** The Scrollbar's registration, whose `thumb` the Thumb fills. */
  part: ScrollAreaScrollbarPart | null = null;
}
