import { InjectionToken, Provider, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  debounceTime,
  exhaustMap,
  race,
  scan,
  startWith,
  Subject,
  takeUntil,
} from 'rxjs';

export type RadianTypeahead = {
  value: Signal<string>;
  search(char: string): void;
  reset(): void;
};

export const RadianTypeahead = new InjectionToken<RadianTypeahead>(
  '[Radian] Typeahead',
);

export function provideRadianTypeahead(): Provider {
  return {
    provide: RadianTypeahead,
    useFactory(): RadianTypeahead {
      const typeahead$ = new Subject<string>();
      const reset$ = new Subject<void>();
      const value$ = typeahead$.pipe(
        exhaustMap((init) =>
          typeahead$.pipe(
            scan((current, typeahead) => current + typeahead, init),
            startWith(init),
            takeUntil(
              // Reset after 1s or when explicitly reset
              race(typeahead$.pipe(debounceTime(1000)), reset$),
            ),
          ),
        ),
      );

      return {
        reset() {
          reset$.next();
        },
        search(char) {
          typeahead$.next(char);
        },
        value: toSignal(value$, { initialValue: '' }),
      };
    },
  };
}

/**
 * This is the "meat" of the typeahead matching logic. It takes in a list of items,
 * the search and the current item, and returns the next item (or `undefined`).
 *
 * We normalize the search because if a user has repeatedly pressed a character,
 * we want the exact same behavior as if we only had that one character
 * (ie. cycle through items starting with that character)
 *
 * We also reorder the items by wrapping the array around the current item.
 * This is so we always look forward from the current item, and picking the first
 * item will always be the correct one.
 *
 * Finally, if the normalized search is exactly one character, we exclude the
 * current item from the values because otherwise it would be the first to match always
 * and focus would never move. This is as opposed to the regular case, where we
 * don't want focus to move if the current item still matches.
 */
export function findNextItem<T extends { textValue: Signal<string> }>(
  items: T[],
  search: string,
  currentItem?: T,
) {
  const isRepeated =
    search.length > 1 && Array.from(search).every((char) => char === search[0]);
  const normalizedSearch = isRepeated ? search[0]! : search;
  const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
  let wrappedItems = wrapArray(items, Math.max(currentItemIndex, 0));
  const excludeCurrentItem = normalizedSearch.length === 1;

  if (excludeCurrentItem) {
    wrappedItems = wrappedItems.filter((v) => v !== currentItem);
  }

  const nextItem = wrappedItems.find((item) =>
    item.textValue().toLowerCase().startsWith(normalizedSearch.toLowerCase()),
  );

  return nextItem !== currentItem ? nextItem : undefined;
}

/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number) {
  return array.map<T>(
    (_, index) => array[(startIndex + index) % array.length]!,
  );
}
