import {
  booleanAttribute,
  computed,
  Directive,
  effect,
  inject,
  input,
} from '@angular/core';
import { RadianCollapsible } from '@loozo/radian/collapsible';
import { uniqueId } from '@loozo/radian/common';
import { RadianAccordionContext } from './accordion-context';
import { RadianAccordionItemContext } from './accordion-item-context';

@Directive({
  selector: '[radianAccordionItem]',
  exportAs: 'radianAccordionItem',
  providers: [
    {
      provide: RadianAccordionItemContext,
      useFactory(): RadianAccordionItemContext {
        const accordionContext = inject(RadianAccordionContext);
        const accordionItem = inject(RadianAccordionItem);

        return {
          orientation: accordionContext.orientation,
          open: accordionItem.open,
          disabled: accordionItem.disabled,
          triggerId: computed(() => `${accordionItem.value()}-trigger`),
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
  /** The value of this accordion item. Will be auto-generated if not provided. */
  value = input<string>(uniqueId('radian-accordion-item'));
  /**
   * Whether this accordion item is disabled.
   * @default false
   * */
  disabled = input(false, { transform: booleanAttribute });

  private accordionContext = inject(RadianAccordionContext);

  /** Whether this accordion item's content is expanded. */
  open = computed(() => this.accordionContext.isItemOpen(this.value()));

  constructor() {
    const collapsible = inject(RadianCollapsible);

    collapsible.open.subscribe((open) => {
      if (open) {
        this.accordionContext.itemOpened(this.value());
      } else {
        this.accordionContext.itemClosed(this.value());
      }
    });

    effect((onCleanup) => {
      if (this.open() && !this.accordionContext.collapsible()) {
        collapsible.disable();
      } else if (this.open() !== collapsible.open()) {
        collapsible.toggle();
      }

      onCleanup(() => collapsible.enable());
    });
  }
}
