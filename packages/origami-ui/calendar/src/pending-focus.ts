/**
 * A Calendar focus request by date. A move into another period, a choice that shows another
 * month or `focus()` before the cells exist asks to focus a date whose cell may not be mounted
 * yet: the request waits until a mounted cell has that date, and is never repaired to another
 * cell first. It is dropped when another request replaces it, when Previous or Next steps, and
 * for good once focus moves to another element, even if focus comes back to where it was. Focus
 * falling to nothing doesn't drop it. Framework-free and package-private.
 */
export interface FocusRequest {
  /** The canonical date to focus. */
  readonly date: string;
  /** The focused element when the request was made, or null. */
  readonly origin: Element | null;
  /** Passed to the cell's native `focus()`. */
  readonly options: FocusOptions | undefined;
}

/**
 * Whether a request may still take focus: focus is where it was when the request was made, or
 * nowhere (the document's body, as after the focused cell was removed with its month). Focus
 * moved anywhere else since, including to Previous, Next or another cell, is never stolen.
 */
export function mayTakeFocus(
  request: FocusRequest,
  active: Element | null,
  body: Element | null,
): boolean {
  return active === null || active === body || active === request.origin;
}
