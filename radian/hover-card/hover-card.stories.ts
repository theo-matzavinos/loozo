import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianHoverCard,
  RadianHoverCardArrow,
  RadianHoverCardContent,
  RadianHoverCardPanel,
  RadianHoverCardPortal,
  RadianHoverCardPresence,
  RadianHoverCardTrigger,
} from './src';
import { RadianArrow } from '@loozo/radian/arrow';

const meta: Meta<RadianHoverCard> = {
  title: 'Hover Card',
  component: RadianHoverCard,
  subcomponents: {
    RadianHoverCardArrow,
    RadianHoverCardContent,
    RadianHoverCardPanel,
    RadianHoverCardPortal,
    RadianHoverCardPresence,
    RadianHoverCardTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianHoverCardArrow,
        RadianHoverCardContent,
        RadianHoverCardPanel,
        RadianHoverCardPortal,
        RadianHoverCardPresence,
        RadianHoverCardTrigger,
        RadianArrow,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianHoverCard>;

const triggerClasses = '';
const contentClasses = '';
const arrowClasses = '';
const content = `<div style="max-width: 400px; display: flex; align-items: center">
      <div style="width: 60px; height: 60px; background-color: red; border-radius: 100px"></div>
      <div style="margin-left: 14px">
        <div style="width: 200px; background-color: red; height: 14px; border-radius: 100px"></div>
        <div
          style="width: 150px; background-color: red; height: 14px; border-radius: 100px; marginTop: 10px;"
        ></div>
      </div>
    </div>`;

export const Basic: Story = {
  render: () => ({
    template: `
    <div style="padding: 50px; display: flex; justify-content: center">
      <div radianHoverCard>
        <a radianHoverCardTrigger href="/" class="${triggerClasses}">
          trigger
        </a>
        <div *radianHoverCardPresence radianHoverCardPortal>
          <div radianHoverCardPanel>
            <div radianHoverCardContent class="${contentClasses}" sideOffset="5">
              <radian-arrow radianHoverCardArrow class="${arrowClasses}" width="20" height="10" />
              ${content}
            </div>
          </div>
        </div>
      </div>
    </div>`,
  }),
};

export const ContainedTextSelection: Story = {
  render: () => ({
    template: `
    <div style="padding: 50px; display: flex; justify-content: center">
      <div radianHoverCard>
        <a radianHoverCardTrigger href="/" class="${triggerClasses}">
          trigger
        </a>
        <div *radianHoverCardPresence radianHoverCardPortal>
          <div radianHoverCardPanel>
            <div radianHoverCardContent class="${contentClasses}" sideOffset="5">
              <radian-arrow radianHoverCardArrow class="${arrowClasses}" width="20" height="10" />
              <div style="max-width: 400px">
                Text selections will be contained within the content. While a selection is active
                the content will not dismiss unless the selection is cleared or an outside
                interaction is performed.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `,
  }),
};
