import {
  booleanAttribute,
  computed,
  contentChildren,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  runInInjectionContext,
  signal,
  untracked,
} from '@angular/core';
import {
  provideRadianFocusScopeContext,
  RadianFocusScope,
} from '@loozo/radian/focus-scope';
import { RadianPopperContent } from '@loozo/radian/popper';

import {
  outputFromObservable,
  outputToObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import {
  debounceTime,
  exhaustMap,
  race,
  scan,
  startWith,
  Subject,
  takeUntil,
} from 'rxjs';
import { RadianKey } from '@loozo/radian/common';
import {
  provideRadianRovingFocusGroupContext,
  RadianFocusable,
  RadianRovingFocusGroup,
} from '@loozo/radian/roving-focus';
import { RadianMenuContentContext } from './menu-content-context';
import {
  GraceIntent,
  Point,
  Polygon,
  RadianMenuContentSide,
} from './menu-content-context';
import { RadianMenuContext, RadianRootMenuContext } from './menu-context';

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
  selector: '[radianMenuContent]',
  providers: [
    {
      provide: RadianMenuContentContext,
      useFactory: RadianMenuContent.contextFactory,
    },
    provideRadianFocusScopeContext(() => {
      const injector = inject(Injector);

      return () =>
        runInInjectionContext(injector, () => {
          const rootContext = inject(RadianRootMenuContext);
          const menuContentContext = inject(RadianMenuContent);

          return {
            loop: menuContentContext.loop,
            trapped: computed(() => rootContext.modal() && rootContext.open()),
          };
        });
    }),
    provideRadianRovingFocusGroupContext(() => {
      const injector = inject(Injector);

      return () =>
        runInInjectionContext(injector, () => {
          const context = inject(RadianMenuContext);
          const menuContentContext = inject(RadianMenuContent);

          return {
            dir: context.dir,
            orientation: computed(() => 'vertical'),
            loop: menuContentContext.loop,
            preventScrollOnItemFocus: computed(() => true),
          };
        });
    }),
  ],
  hostDirectives: [
    RadianFocusScope,
    RadianRovingFocusGroup,
    RadianPopperContent,
  ],
  host: {
    role: 'menu',
    'aria-orientation': 'vertical',
    'data-radian-menu-content': '',
    '[attr.data-state]': 'rootContext.open() ? "open" : "closed"',
    '[attr.dir]': 'rootContext.dir()',
    '[style.outline]': '"none"',
    '(keydown)': 'keyDown($event)',
    '(blur)': 'blurred($event)',
    '(pointermove)': 'pointerMoved($event)',
  },
})
export class RadianMenuContent {
  /**
   * Whether keyboard navigation should loop around
   * @defaultValue false
   */
  loop = input(false, { transform: booleanAttribute });

  private focusScope = inject(RadianFocusScope);
  openAutoFocus = output<Event>();
  /**
   * Event handler called when auto-focusing on close.
   * Can be prevented.
   */
  closeAutoFocus = outputFromObservable(
    outputToObservable(this.focusScope.unmountAutoFocus),
  );
  private rovingFocusGroup = inject(RadianRovingFocusGroup);
  entryFocused = outputFromObservable(
    outputToObservable(this.rovingFocusGroup.itemFocused),
  );

  protected rootContext = inject(RadianRootMenuContext);
  private typeahead = new Subject<string>();
  private search = this.typeahead.pipe(
    exhaustMap((init) =>
      this.typeahead.pipe(
        scan((current, typeahead) => current + typeahead, init),
        startWith(init),
        takeUntil(
          // Reset after 1s or when explicitly reset
          race(this.typeahead.pipe(debounceTime(1000)), this.resetSearch),
        ),
      ),
    ),
  );
  private resetSearch = new Subject<void>();
  private lastPointerX = 0;
  private pointerDir: RadianMenuContentSide = 'right';
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private items = contentChildren(RadianFocusable);
  private currentItemId = signal<string | undefined>(undefined);

  constructor() {
    this.rootContext.content.set(this.elementRef.nativeElement);

    inject(RadianFocusScope).mountAutoFocus.subscribe((e) => {
      // when opening, explicitly focus the content area only and leave
      // `onEntryFocus` in  control of focusing first item
      e.preventDefault();
      this.elementRef.nativeElement.focus({ preventScroll: true });
    });
    const rovingFocusGroup = inject(RadianRovingFocusGroup);

    rovingFocusGroup.itemFocused.subscribe((event) => {
      // only focus first item when using keyboard
      if (!this.rootContext.isUsingKeyboard()) {
        event.preventDefault();
      }
    });

    rovingFocusGroup.activeChange.subscribe((v) => this.currentItemId.set(v));

    effect(() => {
      const itemId = this.currentItemId();

      untracked(() => rovingFocusGroup.setActive(itemId));
    });
  }

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
    const content = this.elementRef.nativeElement;

    if (event.target !== content) {
      return;
    }

    if (!FIRST_LAST_KEYS.includes(event.key)) {
      return;
    }

    event.preventDefault();

    const items = this.items().filter((item) => !item.disabled());
    const candidateNodes = items.map((item) => item.elementRef.nativeElement);

    if (LAST_KEYS.includes(event.key)) {
      candidateNodes.reverse();
    }

    focusFirst(candidateNodes);
  }

  protected blurred(event: FocusEvent) {
    // clear search buffer when leaving the menu
    if (
      event.currentTarget &&
      !(event.currentTarget as HTMLElement).contains(
        event.target as HTMLElement,
      )
    ) {
      this.resetSearch.next();
    }
  }

  protected pointerMoved(event: PointerEvent) {
    if (event.pointerType !== 'mouse') {
      return;
    }

    const target = event.target as HTMLElement;
    const pointerXHasChanged = this.lastPointerX !== event.clientX;

    // We don't use `event.movementX` for this check because Safari will
    // always return `0` on a pointer event.
    if (
      (event.currentTarget as HTMLElement)?.contains(target) &&
      pointerXHasChanged
    ) {
      const newDir = event.clientX > this.lastPointerX ? 'right' : 'left';
      this.pointerDir = newDir;
      this.lastPointerX = event.clientX;
    }
  }

  private static contextFactory(): RadianMenuContentContext {
    const menuContent = inject(RadianMenuContent);
    let pointerGraceIntent: GraceIntent | null = null;

    function isPointerMovingToSubmenu(event: PointerEvent) {
      const isMovingTowards =
        menuContent.pointerDir === pointerGraceIntent?.side;

      return (
        isMovingTowards && isPointerInGraceArea(event, pointerGraceIntent?.area)
      );
    }

    return {
      search: toSignal(menuContent.search),
      itemHovered(event: PointerEvent) {
        if (isPointerMovingToSubmenu(event)) {
          event.preventDefault();
        }
      },
      itemUnhovered(event: PointerEvent) {
        if (isPointerMovingToSubmenu(event)) {
          return;
        }

        menuContent.elementRef.nativeElement.focus();
        menuContent.currentItemId.set(undefined);
      },
      onTriggerLeave(event: PointerEvent) {
        if (isPointerMovingToSubmenu(event)) {
          event.preventDefault();
        }
      },
      onPointerGraceIntentChange(intent: GraceIntent | null) {
        pointerGraceIntent = intent;
      },
    };
  }
}

function isPointerInGraceArea(event: PointerEvent, area?: Polygon) {
  if (!area) return false;
  const cursorPos = { x: event.clientX, y: event.clientY };
  return isPointInPolygon(cursorPos, area);
}

// Determine if a point is inside of a polygon.
// Based on https://github.com/substack/point-in-polygon
function isPointInPolygon(point: Point, polygon: Polygon) {
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ii = polygon[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const jj = polygon[j]!;
    const xi = ii.x;
    const yi = ii.y;
    const xj = jj.x;
    const yj = jj.y;

    // prettier-ignore
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

function focusFirst(candidates: HTMLElement[]) {
  const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
  for (const candidate of candidates) {
    // if focus is already where we want to go, we don't want to keep going through the candidates
    if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
    candidate.focus();
    if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
  }
}
