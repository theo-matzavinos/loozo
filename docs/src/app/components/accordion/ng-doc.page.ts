import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import {
  RadianAccordion,
  RadianAccordionImports,
} from '@loozo/radian/accordion';

const accordion: NgDocPage = {
  title: `Accordion`,
  mdFile: './index.md',
  category: components,
  imports: [RadianAccordionImports],
  playgrounds: {
    AccordionPlayground: {
      target: RadianAccordion,
      defaults: {
        orientation: 'vertical',
      },
      template: `
        <div radianAccordion class="flex rounded data-[orientation=vertical]:flex-col">
          <div radianAccordionItem class="border-b">
            <div radianAccordionHeader class="flex">
              <button radianAccordionTrigger class="flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline">Item 1</button>
            </div>
            <div radianAccordionContent class="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down pb-4 pt-0">
              Static content
            </div>
          </div>

          <div radianAccordionItem class="border-b">
            <div radianAccordionHeader class="flex">
              <button radianAccordionTrigger class="flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline">Item 2</button>
            </div>
            <div radianAccordionContent class="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down pb-4 pt-0">
              <div *radianAccordionContentPresence>
                Lazy content
              </div>
            </div>
          </div>

          <div radianAccordionItem class="border-b">
            <div radianAccordionHeader class="flex">
              <button radianAccordionTrigger class="flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline">Item 3</button>
            </div>
            <div radianAccordionContent class="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down pb-4 pt-0">
              Static content
            </div>
          </div>
        </div>
      `,
    },
  },
};

export default accordion;
