import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianCheckbox,
  RadianCheckboxIndicator,
  RadianCheckboxIndicatorPresence,
  RadianCheckboxInput,
  RadianCheckboxTrigger,
} from './src';
import { signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

const meta: Meta<RadianCheckbox> = {
  title: 'Checkbox',
  component: RadianCheckbox,
  subcomponents: {
    RadianCheckboxIndicator,
    RadianCheckboxIndicatorPresence,
    RadianCheckboxInput,
    RadianCheckboxTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianCheckboxIndicator,
        RadianCheckboxIndicatorPresence,
        RadianCheckboxInput,
        RadianCheckboxTrigger,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianCheckbox>;

const triggerClasses =
  'align-middle border border-black w-8 h-8 p-1 data-disabled:opacity-30 focus:outline-none focus:border-pink-500';
const indicatorClasses =
  'bg-pink-500 block w-full h-1 data-[state=checked]:h-full';

export const InsideLabel: Story = {
  render: () => ({
    template: `
      <label class="inline-flex gap-2">
        Label
        <div radianCheckbox>
          <button class="${triggerClasses}" radianCheckboxTrigger>
            <div class="${indicatorClasses}" *radianCheckboxIndicatorPresence radianCheckboxIndicator></div>
          </button>

          <input radianCheckboxInput />
        </div>
      </label>
    `,
  }),
};

export const LabelFor: Story = {
  render: () => ({
    template: `
      <label for="check">
        Label
      </label>

        <div radianCheckbox class="ml-2 inline-block">
          <button class="${triggerClasses}" radianCheckboxTrigger id="check">
            <div class="${indicatorClasses}" *radianCheckboxIndicatorPresence radianCheckboxIndicator></div>
          </button>

          <input radianCheckboxInput />
        </div>
    `,
  }),
};

export const Indeterminate: Story = {
  render: () => ({
    template: `
      <label class="inline-flex gap-2">
        Label
        <div radianCheckbox checked="indeterminate">
          <button class="${triggerClasses}" radianCheckboxTrigger>
            <div class="${indicatorClasses}" *radianCheckboxIndicatorPresence radianCheckboxIndicator></div>
          </button>

          <input radianCheckboxInput />
        </div>
      </label>
    `,
  }),
};

export const Controlled: Story = {
  render: () => ({
    props: {
      checked: signal(true),
    },
    template: `
      <label class="inline-flex gap-2">
        Label
        <div radianCheckbox [(checked)]="checked">
          <button class="${triggerClasses}" radianCheckboxTrigger>
            <div class="${indicatorClasses}" *radianCheckboxIndicatorPresence radianCheckboxIndicator></div>
          </button>

          <input radianCheckboxInput />
        </div>
      </label>
    `,
  }),
};

export const Forms: Story = {
  render: () => ({
    props: {
      checked: signal(true),
    },
    moduleMetadata: { imports: [FormsModule] },
    template: `
      <label class="inline-flex gap-2">
        Label
        <div radianCheckbox [ngModel]="checked()" (ngModelChange)="checked.set($event)">
          <button class="${triggerClasses}" radianCheckboxTrigger>
            <div class="${indicatorClasses}" *radianCheckboxIndicatorPresence radianCheckboxIndicator></div>
          </button>

          <input radianCheckboxInput />
        </div>
      </label>
    `,
  }),
};
