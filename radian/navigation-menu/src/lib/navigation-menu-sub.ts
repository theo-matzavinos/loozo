import {
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  numberAttribute,
  Signal,
  signal,
} from '@angular/core';
import {
  RadianDirection,
  Direction,
  RadianOrientation,
} from '@loozo/radian/common';
import { RadianNavigationMenuContext } from './navigation-menu-context';

@Directive({
  selector: '[radianNavigationMenuSub]',
  providers: [
    {
      provide: RadianNavigationMenuContext,
      useFactory: RadianNavigationMenuSub.contextFactory,
    },
  ],
  hostDirectives: [
    {
      directive: RadianDirection,
      inputs: ['radianDirection:dir'],
    },
  ],
  host: {
    '[attr.data-orientation]': 'orientation()',
  },
})
export class RadianNavigationMenuSub {
  value = model<string>();
  dir = input<Direction>();
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

  private static contextFactory(): RadianNavigationMenuContext {
    const menu = inject(RadianNavigationMenuSub);
    const context = inject(RadianNavigationMenuContext, { skipSelf: true });
    const triggers = signal<
      Array<{ elementRef: ElementRef<HTMLElement>; value: Signal<string> }>
    >([]);
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
      isRoot: false,
      value: menu.value.asReadonly(),
      previousValue,
      track: computed(() => undefined),
      dir: menu.dir,
      orientation: menu.orientation,
      root: context.root,
      triggers: triggers.asReadonly(),
      viewport: context.viewport,
      triggerHovered(itemValue: string) {
        menu.value.set(itemValue);
      },
      triggerUnhovered() {
        return;
      },
      contentHovered() {
        return;
      },
      contentUnhovered() {
        return;
      },
      itemSelected(itemValue: string) {
        menu.value.set(itemValue);
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
      rootContentDismissed: context.rootContentDismissed,
    };
  }
}
