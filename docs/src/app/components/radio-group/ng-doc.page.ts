import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import { RadianRadioGroup, RadianRadioGroupImports } from '@loozo/radian/radio';

const radioGroup: NgDocPage = {
  title: `Radio Group`,
  mdFile: './index.md',
  category: components,
  imports: [RadianRadioGroupImports],
  playgrounds: {
    RadioGroupPlayground: {
      target: RadianRadioGroup,
      defaults: {
        orientation: 'vertical',
      },
      template: `
          <div radianRadioGroup class="flex data-[orientation=vertical]:flex-col">
            <label radianRadioGroupItem value="one">
              <button radianRadioGroupTrigger class="focus:ring">
                <div radianRadioGroupIndicator>.</div>
              </button>
              <input radianRadioGroupInput />
              Option 1
            </label>

            <label radianRadioGroupItem value="two">
              <button radianRadioGroupTrigger class="focus:ring">
                <div radianRadioGroupIndicator>.</div>
              </button>
              <input radianRadioGroupInput />
              Option 2
            </label>

            <label radianRadioGroupItem value="three">
              <button radianRadioGroupTrigger class="focus:ring">
                <div radianRadioGroupIndicator>.</div>
              </button>
              <input radianRadioGroupInput />
              Option 3
            </label>
          </div>
          `,
    },
  },
};

export default radioGroup;
