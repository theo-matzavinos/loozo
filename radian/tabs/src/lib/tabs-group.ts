import {
  booleanAttribute,
  contentChildren,
  Directive,
  inject,
  input,
  linkedSignal,
  model,
} from '@angular/core';
import {
  RadianDirection,
  Direction,
  RadianOrientation,
} from '@loozo/radian/common';
import { RadianTab } from './tab';
import { RadianTabsGroupContext } from './tabs-group-context';

@Directive({
  selector: '[radianTabsGroup]',
  exportAs: 'radianTabsGroup',
  providers: [
    {
      provide: RadianTabsGroupContext,
      useFactory: RadianTabsGroup.contextFactory,
    },
  ],
  hostDirectives: [
    {
      directive: RadianDirection,
      inputs: ['radianDirection:dir'],
    },
  ],
  host: {
    '[attr.aria-orientation]': 'orientation()',
  },
})
export class RadianTabsGroup {
  /**
   * The id of the currently active tab.
   * Emits when a tab is activated.
   * */
  value = model<string>('');
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input.required<RadianOrientation>();
  /**
   * The direction of navigation between items.
   */
  dir = input<Direction>();
  /**
   * Whether keyboard navigation should loop around
   */
  loop = input(false, { transform: booleanAttribute });
  /**
   * When `automatic`, tabs are activated when receiving `focus`.
   * When `manual`, tabs are activated when `clicked`.
   */
  activationMode = input<'automatic' | 'manual'>('automatic');

  private tabs = contentChildren(RadianTab, { descendants: true });

  private static contextFactory(): RadianTabsGroupContext {
    const tabsGroup = inject(RadianTabsGroup);
    const direction = inject(RadianDirection);
    const active = linkedSignal(
      () => tabsGroup.value() || tabsGroup.tabs()[0]?.value(),
    );

    return {
      orientation: tabsGroup.orientation,
      dir: direction.value,
      loop: tabsGroup.loop,
      activationMode: tabsGroup.activationMode,
      active: active.asReadonly(),
      setActive(id: string) {
        tabsGroup.value.set(id);
      },
    };
  }
}
