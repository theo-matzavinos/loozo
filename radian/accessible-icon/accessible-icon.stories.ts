import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { RadianAccessibleIcon, RadianAccessibleIconLabel } from './src';

const meta: Meta<RadianAccessibleIcon> = {
  title: 'Accessible Icon',
  component: RadianAccessibleIcon,
  subcomponents: {
    RadianAccessibleIconLabel,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [RadianAccessibleIconLabel],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianAccessibleIcon>;

export const Demo: Story = {
  tags: ['!dev'],
  render: () => ({
    template: `
    <button type="button">
      <svg dataRadianAccessibleIcon viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor">
        <path d="M2 30 L30 2 M30 30 L2 2" />
      </svg>
      <div radianAccessibleIconLabel>Close</div>
    </button>
    `,
  }),
};
