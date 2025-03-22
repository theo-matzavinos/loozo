import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import {
  RadianCollapsible,
  RadianCollapsibleImports,
} from '@loozo/radian/collapsible';

const accordion: NgDocPage = {
  title: `Collapsible`,
  mdFile: './index.md',
  category: components,
  imports: [RadianCollapsibleImports],
  playgrounds: {
    CollapsiblePlayground: {
      target: RadianCollapsible,
      defaults: {
        orientation: 'vertical',
      },
      template: `
      <div radianCollapsible class="w-[350px] space-y-2">
        <div class="flex items-center justify-between space-x-4 px-4">
          <h4 class="text-sm font-semibold">
            &commat;peduarte starred 3 repositories
          </h4>
          <button radianCollapsibleTrigger class="w-9 p-0">
            >
          </button>
        </div>
        <div class="rounded-md border px-4 py-3 font-mono text-sm">
          &commat;loozo/radian
        </div>
        <div radianCollapsibleContent class="space-y-2">
          <div class="rounded-md border px-4 py-3 font-mono text-sm">
            &commat;loozo/forms
          </div>
          <div class="rounded-md border px-4 py-3 font-mono text-sm">
            &commat;loozo/ng-lucide
          </div>
        </div radianCollapsibleContent>
      </div>
      `,
    },
  },
};

export default accordion;
