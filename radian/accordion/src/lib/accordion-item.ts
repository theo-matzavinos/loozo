import {
  booleanAttribute,
  computed,
  Directive,
  effect,
  inject,
  InjectionToken,
  input,
  Signal,
} from '@angular/core';
import { RadianCollapsible } from '@loozo/radian/collapsible';
import { RadianOrientation, uniqueId } from '@loozo/radian/common';
import { RadianAccordionContext } from './accordion';
import { RadianCollapsibleContext } from 'radian/collapsible/src/lib/collapsible';

export type RadianAccordionItemContext = {
  orientation: Signal<RadianOrientation>;
  open: Signal<boolean>;
  disabled: Signal<boolean>;
  triggerId: Signal<string>;
};

export const RadianAccordionItemContext =
  new InjectionToken<RadianAccordionContext>('[Radian] Accordion Item Context');

@Directive({
  selector: '[radianAccordionItem]',
  exportAs: 'radianAccordionItem',
  providers: [
    {
      provide: RadianAccordionItemContext,
      useFactory() {
        const accordionContext = inject(RadianAccordionContext);
        const accordionItem = inject(RadianAccordionItem);

        return {
          orientation: accordionContext.orientation,
          open: accordionItem.open,
          disabled: accordionItem.disabled,
          triggerId: computed(() => `${accordionItem.id()}-trigger`),
        };
      },
    },
  ],
  hostDirectives: [
    {
      directive: RadianCollapsible,
      inputs: ['disabled'],
    },
  ],
})
export class RadianAccordionItem {
  /** The id of this accordion item. Will be auto-generated if not provided. */
  id = input<string>(uniqueId('radian-accordion-item'));
  /**
   * Whether this accordion item is disabled.
   * @default false
   * */
  disabled = input(false, { transform: booleanAttribute });

  private accordionContext = inject(RadianAccordionContext);

  /** Whether this accordion item's content is expanded. */
  open = computed(() => this.accordionContext.isItemOpen(this.id()));

  constructor() {
    const collapsibleContext = inject(RadianCollapsibleContext);

    effect(() => {
      if (collapsibleContext.open()) {
        this.accordionContext.itemOpened(this.id());
      } else {
        this.accordionContext.itemClosed(this.id());
      }
    });

    effect((onCleanup) => {
      if (this.open() && !this.accordionContext.collapsible()) {
        collapsibleContext.disable();
      } else if (!this.open() && collapsibleContext.open()) {
        collapsibleContext.toggle();
      }

      onCleanup(() => collapsibleContext.enable());
    });
  }
}
