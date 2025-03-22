import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import { RadianCheckbox, RadianCheckboxImports } from '@loozo/radian/checkbox';

const accordion: NgDocPage = {
  title: `Checkbox`,
  mdFile: './index.md',
  category: components,
  imports: [RadianCheckboxImports],
  playgrounds: {
    CheckboxPlayground: {
      target: RadianCheckbox,
      template: `
        <div radianCheckbox>
          <button radianCheckboxTrigger  class="peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground">
            <div radianCheckboxIndicator class="flex data-[state=unchecked]:hidden items-center justify-center text-current">
              X
            </div>
          </button>
          <input radianCheckboxInput />
        </div>
      `,
    },
  },
};

export default accordion;
