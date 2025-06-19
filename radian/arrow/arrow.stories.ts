import { type Meta, type StoryObj } from '@storybook/angular';

import { RadianArrow } from './src';

const meta: Meta<RadianArrow> = {
  title: 'Arrow',
  component: RadianArrow,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<RadianArrow>;

export const Styled: Story = {
  render: () => ({
    template: `
      <radian-arrow style="vertical-align: middle; fill: crimson" width="20" height="10" />
    `,
  }),
};

export const Sizes: Story = {
  render: () => ({
    template: `
      <div class="flex gap-4">
        <radian-arrow style="vertical-align: middle" width="40" height="10" />
        <radian-arrow style="vertical-align: middle" width="50" height="30" />
        <radian-arrow style="vertical-align: middle" width="20" height="100" />
      </div>
    `,
  }),
};

export const Custom: Story = {
  render: () => ({
    template: `
      <radian-arrow>
            <div
              style="width: 20px; height: 10px; borderBottomLeftRadius: 10px; borderBottomRightRadius: 10px; backgroundColor: tomato"
            ></div>
      </radian-arrow>
    `,
  }),
};
