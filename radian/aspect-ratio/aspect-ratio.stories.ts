import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { RadianAspectRatio, RadianAspectRatioContent } from './src';

const meta: Meta<RadianAspectRatio> = {
  title: 'Aspect Ratio',
  component: RadianAspectRatio,
  subcomponents: {
    RadianAspectRatioContent,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [RadianAspectRatioContent],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianAspectRatio>;

const image = `<img
    src="https://images.unsplash.com/photo-1605030753481-bb38b08c384a?&auto=format&fit=crop&w=400&q=80"
    alt="A house in a forest"
    style="object-fit: cover; width: 100%; height: 100%"
  />`;

export const Default: Story = {
  render: () => ({
    template: `
      <div style="width: 500px">
        <div radianAspectRatio>
          <div radianAspectRatioContent class="flex items-center justify-center bg-red-500 text-white">
            <h1>Default ratio (1/1)</h1>
          </div>
        </div>
      </div>
    `,
  }),
};

export const CustomRatios: Story = {
  render: () => ({
    template: `
          <div class="flex gap-6">
            <div style="width: 200px">
              <div radianAspectRatio [ratio]="1 / 2"><div radianAspectRatioContent>${image}</div></div>
            </div>
            <div style="width: 200px">
              <div radianAspectRatio><div radianAspectRatioContent>${image}</div></div>
            </div>
            <div style="width: 200px">
              <div radianAspectRatio [ratio]="16 / 9"><div radianAspectRatioContent>${image}</div></div>
            </div>
            <div style="width: 200px">
              <div radianAspectRatio [ratio]="2 / 1"><div radianAspectRatioContent>${image}</div></div>
            </div>
          </div>
    `,
  }),
};
