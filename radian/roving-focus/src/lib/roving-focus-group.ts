import {
  computed,
  contentChildren,
  Directive,
  inject,
  InjectionToken,
  output,
  Provider,
  Signal,
  signal,
} from '@angular/core';
import {
  RadianDirectionality,
  RadianEnum,
  RadianKey,
  RadianOrientation,
} from '@loozo/radian/common';
import { RadianFocusable } from './focusable';

const RadianFocusNavigation = {
  First: 'first',
  Last: 'last',
  Previous: 'prev',
  Next: 'next',
} as const;

export type RadianFocusNavigation = RadianEnum<typeof RadianFocusNavigation>;

export type RadianRovingFocusGroupContextOptions = {
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation: Signal<RadianOrientation>;
  /** The direction of navigation between items. */
  dir: Signal<RadianDirectionality>;
  /** Whether keyboard navigation should loop around */
  loop?: Signal<boolean>;

  /** The value of the item to focus by default (e.g. when focus is moved to the group). */
  defaultActive?: Signal<string>;
  /** If set to `true` the container won't be scrolled to ensure the focused item is visible. */
  preventScrollOnItemFocus?: Signal<boolean>;
  /** Whether to stop maintaining roving focus of its children. */
  disabled?: Signal<boolean>;
};

export const RadianRovingFocusGroupContextOptions =
  new InjectionToken<RadianRovingFocusGroupContextOptions>(
    '[Radian] Roving Focus Group Context Options',
  );

export type RadianRovingFocusGroupContext = ReturnType<
  (typeof RadianRovingFocusGroup)['contextFactory']
>;

export const RadianRovingFocusGroupContext =
  new InjectionToken<RadianRovingFocusGroupContext>(
    '[RadianRovingFocus] Roving Focus Group Context',
  );

export function provideRadianRovingFocusGroupContext(
  factory: () => RadianRovingFocusGroupContextOptions,
): Provider {
  return {
    provide: RadianRovingFocusGroupContextOptions,
    useFactory: factory,
  };
}

@Directive({
  host: {
    '[style]': `{ outline: 'none' }`,
    '[attr.tabindex]': 'tabIndex()',
    '[attr.data-orientation]': 'orientation()',
    '(mousedown)': 'isClickFocused.set(true)',
    '(focus)': 'focused($event)',
    '(blur)': 'isTabbingOut.set(false)',
    '(keydown)': 'keyDown($event)',
  },
  providers: [
    {
      provide: RadianRovingFocusGroupContext,
      useFactory: RadianRovingFocusGroup.contextFactory,
    },
  ],
})
export class RadianRovingFocusGroup {
  protected options = inject(RadianRovingFocusGroupContextOptions);

  /** Emits before focus is moved to the group. Calling `preventDefault` will cancel the move. */
  beforeFocus = output<Event>();

  /**
   * Emits when the currently focused item changes.
   */
  itemFocused = output<RadianFocusable>();

  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = this.options.orientation;

  private _active = signal<string | undefined>(undefined);

  /** The value of the currently focused item. */
  active = this._active.asReadonly();

  protected tabIndex = computed(() =>
    this.isTabbingOut() || this.items().length === 0 ? -1 : 0,
  );
  protected isTabbingOut = signal(false);
  protected isClickFocused = signal(false);
  private items = contentChildren(RadianFocusable, { descendants: true });

  protected focused(event: FocusEvent) {
    // We normally wouldn't need this check, because we already check
    // that the focus is on the current target and not bubbling to it.
    // We do this because Safari doesn't focus buttons when clicked, and
    // instead, the wrapper will get focused and not through a bubbling event.
    const isKeyboardFocus = !this.isClickFocused();

    if (
      event.target !== event.currentTarget ||
      !isKeyboardFocus ||
      this.isTabbingOut()
    ) {
      return;
    }

    this.beforeFocus.emit(event);

    if (event.defaultPrevented) {
      return;
    }

    const items = this.items().filter((item) => !item.computedDisabled());
    const activeItem = items.find((item) => item.active());
    const currentItem = items.find((item) => item.value() === this.active());

    const candidates = [
      activeItem,
      currentItem,
      this.options.defaultActive?.(),
      ...items,
    ].filter(Boolean) as typeof items;
    this.focusFirst(candidates);

    this.isClickFocused.set(false);
  }

  private focusFirst(candidates: RadianFocusable[]) {
    const currentFocusedElement = document.activeElement;

    for (const candidate of candidates) {
      // if focus is already where we want to go, we don't want to keep going through the candidates
      if (candidate.elementRef.nativeElement === currentFocusedElement) {
        return;
      }

      candidate.elementRef.nativeElement.focus({
        preventScroll: this.options.preventScrollOnItemFocus?.(),
      });

      if (document.activeElement !== currentFocusedElement) {
        return;
      }
    }
  }

  protected keyDown(event: KeyboardEvent) {
    if (event.shiftKey && event.key === RadianKey.Tab) {
      this.isTabbingOut.set(true);

      return;
    }

    if (this.options.disabled?.()) {
      return;
    }

    if (
      !(
        event.target instanceof HTMLElement &&
        event.target.hasAttribute('data-radian-focusable')
      )
    ) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }

    const navigation =
      RadianKeysToFocusNavigation[this.options.dir()][
        this.options.orientation()
      ][event.key];

    if (!navigation) {
      return;
    }

    event.preventDefault();
    let items = this.items().filter((item) => !item.computedDisabled());

    if (navigation === RadianFocusNavigation.First) {
      this.focusFirst(items);

      return;
    }

    if (navigation === RadianFocusNavigation.Last) {
      this.focusFirst(items.reverse());

      return;
    }

    if (navigation === RadianFocusNavigation.Previous) {
      items.reverse();
    }

    const currentIndex = items.findIndex(
      (i) => i.elementRef.nativeElement === event.target,
    );

    items = this.options.loop?.()
      ? wrapArray(items, currentIndex + 1)
      : items.slice(currentIndex + 1);

    this.focusFirst(items);
  }

  private static contextFactory() {
    const options = inject(RadianRovingFocusGroupContextOptions);
    const rovingFocusGroup = inject(RadianRovingFocusGroup);

    return {
      ...options,
      active: rovingFocusGroup.active,
      orientation: rovingFocusGroup.orientation,
      /** @internal */
      onItemFocused(value: string) {
        const item = rovingFocusGroup.items().find((i) => i.value() === value);

        if (!item) {
          throw new Error(`Failed to find focused item with value '${value}'.`);
        }

        rovingFocusGroup._active.set(value);
        rovingFocusGroup.itemFocused.emit(item);
        rovingFocusGroup.isClickFocused.set(false);
      },
    };
  }
}

const RadianKeysToFocusNavigation: Record<
  RadianDirectionality,
  Record<RadianOrientation, Partial<Record<string, RadianFocusNavigation>>>
> = {
  [RadianDirectionality.LeftToRight]: {
    [RadianOrientation.Horizontal]: {
      [RadianKey.ArrowLeft]: RadianFocusNavigation.Previous,
      [RadianKey.ArrowRight]: RadianFocusNavigation.Next,
      [RadianKey.Home]: RadianFocusNavigation.First,
      [RadianKey.End]: RadianFocusNavigation.Last,
    },
    [RadianOrientation.Vertical]: {
      [RadianKey.ArrowUp]: RadianFocusNavigation.Previous,
      [RadianKey.ArrowDown]: RadianFocusNavigation.Next,
      [RadianKey.Home]: RadianFocusNavigation.First,
      [RadianKey.End]: RadianFocusNavigation.Last,
    },
  },
  [RadianDirectionality.RightToLeft]: {
    [RadianOrientation.Horizontal]: {
      [RadianKey.ArrowRight]: RadianFocusNavigation.Previous,
      [RadianKey.ArrowLeft]: RadianFocusNavigation.Next,
      [RadianKey.Home]: RadianFocusNavigation.First,
      [RadianKey.End]: RadianFocusNavigation.Last,
    },
    [RadianOrientation.Vertical]: {
      [RadianKey.ArrowUp]: RadianFocusNavigation.Previous,
      [RadianKey.ArrowDown]: RadianFocusNavigation.Next,
      [RadianKey.Home]: RadianFocusNavigation.First,
      [RadianKey.End]: RadianFocusNavigation.Last,
    },
  },
};

/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number) {
  return array.map((_, index) => array[(startIndex + index) % array.length]);
}
