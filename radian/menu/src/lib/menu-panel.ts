import {
  booleanAttribute,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
  output,
} from '@angular/core';
import {
  provideRadianFocusScopeContext,
  RadianFocusScope,
} from '@loozo/radian/focus-scope';
import { RadianPopperPanel } from '@loozo/radian/popper';
import { RadianPopperAlignment } from 'radian/popper/src/lib/popper';
import { RadianPopperSide } from 'radian/popper/src/lib/popper-context';
import { RadianMenuContext } from './menu';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianDismissibleLayer } from '@loozo/radian/dismissible-layer';
import {
  debounceTime,
  exhaustMap,
  scan,
  startWith,
  Subject,
  takeUntil,
} from 'rxjs';
import { RadianKey } from '@loozo/radian/common';
import { RadianRovingFocusGroup } from '@loozo/radian/roving-focus';

const FIRST_KEYS = [
  RadianKey.ArrowDown,
  RadianKey.PageUp,
  RadianKey.Home,
] as string[];
const LAST_KEYS = [
  RadianKey.ArrowUp,
  RadianKey.PageDown,
  RadianKey.End,
] as string[];
const FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];

@Directive({
  selector: '[radianMenuPanel]',
  providers: [
    provideRadianFocusScopeContext(() => {
      const context = inject(RadianMenuContext);
      const menuPanel = inject(RadianMenuPanel);

      return {
        loop: menuPanel.loop,
        trapped: context.modal,
      };
    }),
  ],
  hostDirectives: [
    RadianFocusScope,
    RadianDismissibleLayer,
    RadianRovingFocusGroup,
    {
      directive: RadianPopperPanel,
      inputs: [
        'side',
        'sideOffset',
        'align',
        'alignOffset',
        'arrowPadding',
        'avoidCollisions',
        'collisionBoundary',
        'collisionPadding',
        'sticky',
        'hideWhenDetached',
        'updatePositionStrategy',
      ],
    },
  ],
})
export class RadianMenuPanel {
  /**
   * The preferred side of the anchor to render against when open.
   * Will be reversed when collisions occur and avoidCollisions is enabled.
   */
  side = input<RadianPopperSide>(RadianPopperSide.Bottom);
  /** The distance in pixels from the anchor. */
  sideOffset = input(0, { transform: numberAttribute });
  /** The preferred alignment against the anchor. May change when collisions occur. */
  align = input<RadianPopperAlignment>(RadianPopperAlignment.Center);
  /** An offset in pixels from the `start` or `end` alignment options. */
  alignOffset = input(0, { transform: numberAttribute });
  /**
   * The padding between the arrow and the edges of the content.
   * If your content has border-radius, this will prevent it from overflowing the corners.
   */
  arrowPadding = input(0, { transform: numberAttribute });
  /** When `true`, overrides the `side` and `align` preferences to prevent collisions with boundary edges. */
  avoidCollisions = input(true, { transform: booleanAttribute });
  /**
   * The element used as the collision boundary.
   * By default this is the viewport, though you can provide additional element(s) to be included in this check.
   */
  collisionBoundary = input<
    ElementRef<HTMLElement> | ElementRef<HTMLElement>[]
  >();
  /**
   * The distance in pixels from the boundary edges where collision detection should occur.
   * Accepts a number (same for all sides), or a partial padding object, for example: `{ top: 20, left: 20 }`.
   */
  collisionPadding = input<number | Partial<Record<RadianPopperSide, number>>>(
    0,
  );
  /**
   * The sticky behavior on the `align` axis.
   * - `partial` will keep the content in the boundary as long as the trigger is at least partially in the boundary
   * - `always` will keep the content in the boundary regardless.
   */
  sticky = input<'partial' | 'always'>('partial');
  /** Whether to hide the content when the trigger becomes fully occluded. */
  hideWhenDetached = input(false, { transform: booleanAttribute });
  /** Whether to update the position of the floating element on every animation frame if required. */
  updatePositionStrategy = input<'optimized' | 'always'>('optimized');
  /**
   * Whether keyboard navigation should loop around
   * @defaultValue false
   */
  loop = input(false, { transform: booleanAttribute });

  private focusScope = inject(RadianFocusScope);
  private dismissibleLayer = inject(RadianDismissibleLayer);
  /**
   * Event handler called when auto-focusing on close.
   * Can be prevented.
   */
  closeAutoFocus = outputFromObservable(
    outputToObservable(this.focusScope.unmountAutoFocus),
  );
  entryFocused = output();
  escapeKeyDown = outputFromObservable(
    outputToObservable(this.dismissibleLayer.escapeKeyDown),
  );
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.pointerDownOutside),
  );
  focusOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.focusOutside),
  );
  interactionOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.interactionOutside),
  );

  private typeahead = new Subject<string>();
  private search = this.typeahead.pipe(
    exhaustMap((init) =>
      this.typeahead.pipe(
        scan((current, typeahead) => current + typeahead, init),
        startWith(init),
        // Reset after 1s
        takeUntil(this.typeahead.pipe(debounceTime(1000))),
      ),
    ),
  );

  protected keyDown(event: KeyboardEvent) {
    // submenu key events may bubble. We only care about keys in this menu.
    const target = event.target as HTMLElement;
    const isKeyDownInside =
      target.closest('[data-radian-menu-content]') === event.currentTarget;
    const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
    const isCharacterKey = event.key.length === 1;

    if (isKeyDownInside) {
      // menus should not be navigated using tab key so we prevent it
      if (event.key === 'Tab') {
        event.preventDefault();
      }

      if (!isModifierKey && isCharacterKey) {
        this.typeahead.next(event.key);
      }
    }
    // focus first/last item based on key pressed
    const content = contentRef.current;

    if (event.target !== content) {
      return;
    }

    if (!FIRST_LAST_KEYS.includes(event.key)) {
      return;
    }

    event.preventDefault();

    const items = getItems().filter((item) => !item.disabled);
    const candidateNodes = items.map((item) => item.ref.current!);

    if (LAST_KEYS.includes(event.key)) {
      candidateNodes.reverse();
    }

    focusFirst(candidateNodes);
  }
}
