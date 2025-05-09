import {
  computed,
  contentChild,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  model,
  numberAttribute,
  Signal,
  signal,
} from '@angular/core';
import {
  RadianDirection,
  RadianDirectionality,
  RadianOrientation,
} from '@loozo/radian/common';
import { RadianNavigationMenuTrack } from './navigation-menu-track';
import { Subject } from 'rxjs';
import { RadianNavigationMenuViewportOutlet } from './navigation-menu-viewport-outlet';

export type RadianNavigationMenuContext = ReturnType<
  (typeof RadianNavigationMenu)['contextFactory']
>;

export const RadianNavigationMenuContext =
  new InjectionToken<RadianNavigationMenuContext>(
    '[Radian] Navigation Menu Context',
  );

@Directive({
  selector: '[radianNavigationMenu]',
  providers: [
    {
      provide: RadianNavigationMenuContext,
      useFactory: RadianNavigationMenu.contextFactory,
    },
  ],
  hostDirectives: [
    {
      directive: RadianDirection,
      inputs: ['radianDirection:dir'],
    },
  ],
  host: {
    'aria-label': 'Main',
    '[attr.data-orientation]': 'orientation()',
  },
})
export class RadianNavigationMenu {
  value = model<string>();
  dir = input<RadianDirectionality>();
  orientation = input<RadianOrientation>(RadianOrientation.Horizontal);
  /**
   * The duration from when the pointer enters the trigger until the tooltip gets opened.
   * @defaultValue 200
   */
  delayMs = input(200, { transform: numberAttribute });
  /**
   * How much time a user has to enter another trigger without incurring a delay again.
   * @defaultValue 300
   */
  skipDelayMs = input(300, { transform: numberAttribute });

  private track = contentChild.required<
    RadianNavigationMenuTrack,
    ElementRef<HTMLElement>
  >(RadianNavigationMenuTrack, { read: ElementRef });
  private viewportOutlet = contentChild<
    RadianNavigationMenuViewportOutlet,
    ElementRef<HTMLElement>
  >(RadianNavigationMenuViewportOutlet, { read: ElementRef });

  private static contextFactory() {
    const menu = inject(RadianNavigationMenu);
    const destroyRef = inject(DestroyRef);
    const openTimer = signal(0);
    const closeTimer = signal(0);
    const skipDelayTimer = signal(0);
    const isOpenDelayed = signal(false);
    const triggers = signal<
      Array<{ elementRef: ElementRef<HTMLElement>; value: Signal<string> }>
    >([]);
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    destroyRef.onDestroy(() => {
      clearTimeout(openTimer());
      clearTimeout(closeTimer());
      clearTimeout(skipDelayTimer());
    });

    const startCloseTimer = () => {
      clearTimeout(closeTimer());
      closeTimer.set(setTimeout(() => menu.value.set(''), 150));
    };

    const valueTracker = linkedSignal<
      string | undefined,
      Record<'current' | 'previous', string | undefined>
    >({
      source: menu.value,
      computation(source, previous) {
        return {
          current: source,
          previous: previous?.value.current,
        };
      },
    });
    const previousValue = computed(() => valueTracker().previous);

    return {
      isRoot: true,
      value: menu.value.asReadonly(),
      previousValue,
      track: menu.track as Signal<ElementRef<HTMLElement> | undefined>,
      dir: menu.dir,
      orientation: menu.orientation,
      root: elementRef.nativeElement,
      triggers: triggers.asReadonly(),
      viewportOutlet: menu.viewportOutlet,
      triggerHovered(itemValue: string) {
        clearTimeout(openTimer());
        if (isOpenDelayed()) {
          const isOpenItem = menu.value() === itemValue;
          if (isOpenItem) {
            // If the item is already open (e.g. we're transitioning from the content to the trigger)
            // then we want to clear the close timer immediately.
            clearTimeout(closeTimer());
          } else {
            openTimer.set(
              setTimeout(() => {
                clearTimeout(closeTimer());
                menu.value.set(itemValue);
              }, menu.delayMs()),
            );
          }
        } else {
          clearTimeout(closeTimer());
          menu.value.set(itemValue);
        }
      },
      triggerUnhovered() {
        clearTimeout(openTimer());
        startCloseTimer();
      },
      contentHovered() {
        clearTimeout(closeTimer());
      },
      contentUnhovered() {
        startCloseTimer();
      },
      itemSelected(itemValue: string) {
        menu.value.update((prevValue) =>
          prevValue === itemValue ? '' : itemValue,
        );
      },
      itemDismissed() {
        menu.value.set('');
      },
      triggerAdded(value: Signal<string>, trigger: ElementRef<HTMLElement>) {
        triggers.update((v) => [...v, { elementRef: trigger, value }]);
      },
      triggerRemoved(trigger: ElementRef<HTMLElement>) {
        triggers.update((v) =>
          v.filter((i) => i.elementRef.nativeElement !== trigger.nativeElement),
        );
      },
      rootContentDismissed: new Subject<void>(),
    };
  }
}
