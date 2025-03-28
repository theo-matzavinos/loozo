import {
  computed,
  Directive,
  inject,
  InjectionToken,
  input,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianTabsGroupContext } from './tabs-group';

export type RadianTabContext = ReturnType<(typeof RadianTab)['contextFactory']>;

export const RadianTabContext = new InjectionToken<RadianTabContext>(
  '[Radian] Tab Context',
);

@Directive({
  selector: '[radianTab]',
  exportAs: 'radianTab',
  providers: [
    { provide: RadianTabContext, useFactory: RadianTab.contextFactory },
  ],
})
export class RadianTab {
  /** @internal */
  value = input(uniqueId('radian-tab'));

  /** Whether the tab is currently active. */
  isActive = computed(() => this.context.active() === this.value());
  /** Current state of the tab. */
  state = computed(() => (this.isActive() ? 'active' : 'inactive'));

  /** The id of the content element */
  contentId = computed(() => `${this.value()}-content`);
  /** The id of the trigger element */
  triggerId = computed(() => `${this.value()}-trigger`);

  protected context = inject(RadianTabsGroupContext);

  private static contextFactory() {
    const tab = inject(RadianTab);

    return {
      active: tab.isActive,
      state: tab.state,
      contentId: tab.contentId,
      triggerId: tab.triggerId,
      orientation: tab.context.orientation,
    };
  }
}
