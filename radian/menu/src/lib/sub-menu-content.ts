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
import { RadianSubMenuContext } from './sub-menu-context';
import {
  GraceIntent,
  Point,
  Polygon,
  RadianMenuContentContext,
  RadianMenuContentSide,
} from './menu-content-context';
import { RadianMenuContext } from './menu-context';

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
  selector: '[radianSubMenuContent]',
  providers: [
    {
      provide: RadianMenuContentContext,
      useFactory: RadianSubMenuContent.contextFactory,
    },
    provideRadianFocusScopeContext(() => {
      const injector = inject(Injector);

      return () =>
        runInInjectionContext(injector, () => {
          const subMenuContent = inject(RadianSubMenuContent);

          return {
            loop: subMenuContent.loop,
            trapped: computed(() => false),
          };
        });
    }),
    provideRadianRovingFocusGroupContext(() => {
      const injector = inject(Injector);

      return () =>
        runInInjectionContext(injector, () => {
          const context = inject(RadianMenuContext);
          const subMenuContent = inject(RadianSubMenuContent);

          return {
            dir: context.dir,
            orientation: computed(() => 'vertical'),
            loop: subMenuContent.loop,
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
    '[attr.aria-labelledby]': 'subContext.triggerId',
    '[attr.data-state]': 'rootContext.open() ? "open" : "closed"',
    '[attr.dir]': 'rootContext.dir()',
    '[style.outline]': '"none"',
    '(keydown)': 'keyDown($event)',
    '(blur)': 'blurred($event)',
    '(pointermove)': 'pointerMoved($event)',
  },
})
export class RadianSubMenuContent {
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
  entryFocused = output();
  protected rootContext = inject(RadianMenuContext);
  protected subContext = inject(RadianSubMenuContext);
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

    const focusScope = inject(RadianFocusScope);

    focusScope.mountAutoFocus.subscribe((event) => {
      // when opening a submenu, focus content for keyboard users only
      if (this.rootContext.isUsingKeyboard()) {
        this.elementRef.nativeElement.focus();
      }

      event.preventDefault();
    });

    focusScope.unmountAutoFocus.subscribe((event) => {
      event.preventDefault();
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
    const menuContent = inject(RadianSubMenuContent);
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
        if (isPointerMovingToSubmenu(event)) event.preventDefault();
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
