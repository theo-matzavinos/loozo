import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  model,
  numberAttribute,
  Provider,
  signal,
} from '@angular/core';
import { RadianPopper } from '@loozo/radian/popper';
import { Subject } from 'rxjs';
import { RadianTooltipTrigger } from './tooltip-trigger';
import { uniqueId } from '@loozo/radian/common';
import { RadianTooltipContext } from './tooltip-context';

export type RadianTooltipDefaults = {
  /**
   * The duration from when the pointer enters the trigger until the tooltip gets opened.
   * @defaultValue 700
   */
  delayMs?: number;
  /**
   * How much time a user has to enter another trigger without incurring a delay again.
   * @defaultValue 300
   */
  skipDelayMs?: number;
  /**
   * When `true`, trying to hover the content will result in the tooltip closing as the pointer leaves the trigger.
   * @defaultValue false
   */
  disableHoverableContent?: boolean;
};

export const RadianTooltipDefaults = new InjectionToken<
  Required<RadianTooltipDefaults>
>('[Radian] Tooltip Defaults', {
  factory() {
    return {
      delayMs: 700,
      skipDelayMs: 300,
      disableHoverableContent: false,
    };
  },
});

export function provideRadianTooltipDefaults({
  delayMs = 700,
  disableHoverableContent = false,
  skipDelayMs = 300,
}: RadianTooltipDefaults): Provider {
  return {
    provide: RadianTooltipDefaults,
    useValue: {
      delayMs,
      disableHoverableContent,
      skipDelayMs,
    },
  };
}

const tooltipOpen = new Subject<void>();

@Directive({
  selector: '[radianTooltip]',
  hostDirectives: [
    {
      directive: RadianPopper,
    },
  ],
  providers: [
    { provide: RadianTooltipContext, useFactory: RadianTooltip.contextFactory },
  ],
})
export class RadianTooltip {
  private defaults = inject(RadianTooltipDefaults);

  open = model(false);
  /**
   * The duration from when the pointer enters the trigger until the tooltip gets opened.
   */
  delayMs = input(this.defaults.delayMs, { transform: numberAttribute });
  /**
   * When `true`, trying to hover the content will result in the tooltip closing as the pointer leaves the trigger.
   */
  disableHoverableContent = input(this.defaults.disableHoverableContent, {
    transform: booleanAttribute,
  });

  private wasOpenDelayed = signal(false);
  private openTimer = signal(0);
  private state = computed(() => {
    if (!this.open()) {
      return 'closed';
    }

    return this.wasOpenDelayed() ? 'delayed-open' : 'instant-open';
  });
  private isPointerInTransit = signal(false);
  private trigger = contentChild.required(RadianTooltipTrigger, {
    read: ElementRef,
  });
  private isOpenDelayed = signal(true);

  constructor() {
    tooltipOpen.next();
    const skipDelayTimer = signal(0);
    const defaults = inject(RadianTooltipDefaults);

    effect(() => {
      if (this.open()) {
        clearTimeout(skipDelayTimer());
        this.isOpenDelayed.set(false);
      } else {
        clearTimeout(skipDelayTimer());
        skipDelayTimer.set(
          setTimeout(() => this.isOpenDelayed.set(true), defaults.skipDelayMs),
        );
      }
    });
  }

  private handleOpen() {
    window.clearTimeout(this.openTimer());
    this.openTimer.set(0);
    this.wasOpenDelayed.set(false);
    this.open.set(true);
  }

  private handleClose() {
    window.clearTimeout(this.openTimer());
    this.openTimer.set(0);
    this.open.set(false);
  }

  private handleDelayedOpen() {
    window.clearTimeout(this.openTimer());
    this.openTimer.set(
      window.setTimeout(() => {
        this.wasOpenDelayed.set(true);
        this.open.set(true);
        this.openTimer.set(0);
      }, this.delayMs()),
    );
  }

  private static contextFactory(): RadianTooltipContext {
    const tooltip = inject(RadianTooltip);

    return {
      isOpen: tooltip.open.asReadonly(),
      state: tooltip.state,
      trigger: tooltip.trigger,
      contentId: `${uniqueId('radian-tooltip')}-content`,
      tooltipOpen,
      isPointerInTransit: tooltip.isPointerInTransit.asReadonly(),
      open() {
        tooltip.handleOpen();
      },
      close() {
        tooltip.handleClose();
      },
      pointerInTransitChanged(inTransit: boolean) {
        tooltip.isPointerInTransit.set(inTransit);
      },
      triggerHovered() {
        if (tooltip.isOpenDelayed()) {
          tooltip.handleDelayedOpen();
        } else {
          tooltip.handleOpen();
        }
      },
      triggerUnhovered() {
        if (tooltip.disableHoverableContent()) {
          tooltip.handleClose();
        } else {
          // Clear the timer in case the pointer leaves the trigger before the tooltip is opened.
          window.clearTimeout(tooltip.openTimer());
          tooltip.openTimer.set(0);
        }
      },
    };
  }
}
