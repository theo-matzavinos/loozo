import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import { RadianAvatar, RadianAvatarFallback, RadianAvatarImage } from './src';

const meta: Meta<RadianAvatar> = {
  title: 'Avatar',
  component: RadianAvatar,
  subcomponents: {
    RadianAvatarFallback,
    RadianAvatarImage,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [RadianAvatarFallback, RadianAvatarImage],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianAvatar>;

const src = 'https://picsum.photos/id/1005/400/400';
const srcBroken = 'https://broken.link.com/broken-pic.jpg';

const avatarClasses =
  'inline-flex items-center justify-center align-middle overflow-hidden select-none rounded-full w-12 h-12';
const imageClasses = 'w-full h-full object-cover';
const fallbackClasses =
  'w-full h-full flex items-center justify-center bg-gray-500 text-black';

export const WorkingImage: Story = {
  name: 'With Working Image',
  render: () => ({
    template: `
    <div radianAvatar class="${avatarClasses}">
      <img radianAvatarImage class="${imageClasses}" alt="John Smith" src="${src}" />
      <div *radianAvatarFallback delayMs="300" class="${fallbackClasses}">
        JS
      </div>
    </div>
    `,
  }),
};

export const BrokenImage: Story = {
  name: 'With Broken Image',
  render: () => ({
    template: `
    <div radianAvatar class="${avatarClasses}">
      <img radianAvatarImage class="${imageClasses}" alt="John Smith" src="${srcBroken}" />
      <div *radianAvatarFallback class="${fallbackClasses}">
        JS
      </div>
    </div>
    `,
  }),
};
