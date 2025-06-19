import { type Meta, type StoryObj } from '@storybook/angular';

import { RadianLabel } from './src';

const meta: Meta<RadianLabel> = {
  title: 'Label',
  component: RadianLabel,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<RadianLabel>;

export const Demo: Story = {
  tags: ['!dev'],
  render: () => ({
    template: `
      <label radianLabel class="flex gap-2">
        Label
        <input class="border border-black" />
      </label>
    `,
  }),
};
