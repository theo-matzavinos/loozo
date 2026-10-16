import type { WritableSignal } from "@angular/core";

/**
 * @internal Package-private single-selection write rule shared by Origami's selection widgets;
 * not an application API. Writes only a change: selecting the selected item or clearing an
 * unselected one writes nothing.
 * @param selection - The widget's effective selected value.
 * @param item - The requesting item's value.
 * @param wanted - Whether the item asks to become selected or to clear.
 * @param clearable - The widget's policy: whether the selected item may clear the selection to null.
 */
export function ɵrequestSingleSelection(
  selection: WritableSignal<string | null>,
  item: string,
  wanted: boolean,
  clearable: boolean,
): void {
  const selected = selection() === item;

  if (wanted === selected) {
    return;
  }

  if (wanted) {
    selection.set(item);

    return;
  }

  if (clearable) {
    selection.set(null);
  }
}

/**
 * @internal Package-private multiple-selection write rule shared by Origami's selection widgets;
 * not an application API. Adds at the end or removes in a new array, keeping every other entry
 * (unknown values included) in order and never mutating the caller's array; a request that
 * matches the current state writes nothing.
 * @param selection - The widget's effective selected values.
 * @param item - The requesting item's value.
 * @param wanted - Whether the item asks to be added or removed.
 */
export function ɵrequestMultipleSelection(
  selection: WritableSignal<readonly string[]>,
  item: string,
  wanted: boolean,
): void {
  const current = selection();
  const selected = current.includes(item);

  if (wanted === selected) {
    return;
  }

  if (wanted) {
    selection.set([...current, item]);

    return;
  }

  const remaining: string[] = [];

  for (const entry of current) {
    if (entry !== item) {
      remaining.push(entry);
    }
  }

  selection.set(remaining);
}
