import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianCollapsible,
  RadianCollapsibleContent,
  RadianCollapsiblePresence,
  RadianCollapsibleTrigger,
} from './src';
import { signal } from '@angular/core';

const meta: Meta<RadianCollapsible> = {
  title: 'Collapsible',
  component: RadianCollapsible,
  subcomponents: {
    RadianCollapsibleContent,
    RadianCollapsiblePresence,
    RadianCollapsibleTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianCollapsibleContent,
        RadianCollapsiblePresence,
        RadianCollapsibleTrigger,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianCollapsible>;

const collapsibleClasses = 'border-t border-b';
const triggerClasses =
  'flex flex-1 items-start justify-between gap-4 py-4 text-left text-sm font-medium outline-none hover:underline disabled:pointer-events-none disabled:opacity-50';
const contentClasses = 'border-t';

export const Uncontrolled: Story = {
  render: () => ({
    template: `
      <div radianCollapsible class="${collapsibleClasses}">
        <button radianCollapsibleTrigger class="${triggerClasses}">Trigger</button>
        <div class="${contentClasses}" *radianCollapsiblePresence radianCollapsibleContent>
          Content
        </div>
      </div>
    `,
  }),
};

export const Controlled: Story = {
  render: () => ({
    props: {
      open: signal(true),
    },
    template: `
      <div radianCollapsible class="${collapsibleClasses}" [(open)]="open">
        <button radianCollapsibleTrigger class="${triggerClasses}">Trigger</button>
        <div class="${contentClasses}" *radianCollapsiblePresence radianCollapsibleContent>
          Content
        </div>
      </div>
    `,
  }),
};
