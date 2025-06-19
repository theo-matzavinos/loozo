import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianNavigationMenu,
  RadianNavigationMenuContent,
  RadianNavigationMenuContentPresence,
  RadianNavigationMenuIndicator,
  RadianNavigationMenuIndicatorPresence,
  RadianNavigationMenuItem,
  RadianNavigationMenuLink,
  RadianNavigationMenuList,
  RadianNavigationMenuSub,
  RadianNavigationMenuTrack,
  RadianNavigationMenuTrigger,
  RadianNavigationMenuViewport,
  RadianNavigationMenuViewportOutlet,
  RadianNavigationMenuViewportPortal,
  RadianNavigationMenuViewportPresence,
  RadianNavigationMenuViewportProxy,
} from './src';
import { signal } from '@angular/core';

const meta: Meta<RadianNavigationMenu> = {
  title: 'Navigation Menu',
  component: RadianNavigationMenu,
  subcomponents: {
    RadianNavigationMenuContent,
    RadianNavigationMenuContentPresence,
    RadianNavigationMenuIndicator,
    RadianNavigationMenuIndicatorPresence,
    RadianNavigationMenuItem,
    RadianNavigationMenuLink,
    RadianNavigationMenuList,
    RadianNavigationMenuSub,
    RadianNavigationMenuTrack,
    RadianNavigationMenuTrigger,
    RadianNavigationMenuViewport,
    RadianNavigationMenuViewportOutlet,
    RadianNavigationMenuViewportPortal,
    RadianNavigationMenuViewportPresence,
    RadianNavigationMenuViewportProxy,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianNavigationMenuContent,
        RadianNavigationMenuContentPresence,
        RadianNavigationMenuIndicator,
        RadianNavigationMenuIndicatorPresence,
        RadianNavigationMenuItem,
        RadianNavigationMenuLink,
        RadianNavigationMenuList,
        RadianNavigationMenuSub,
        RadianNavigationMenuTrack,
        RadianNavigationMenuTrigger,
        RadianNavigationMenuViewport,
        RadianNavigationMenuViewportOutlet,
        RadianNavigationMenuViewportPortal,
        RadianNavigationMenuViewportPresence,
        RadianNavigationMenuViewportProxy,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianNavigationMenu>;

const triggerClasses = '';
const separatorClasses = 'border-t border-black my-2';
const contentClasses = 'bg-white border border-black';
const itemClasses =
  'flex items-center justify-between hover:bg-gray-100 data-disabled:opacity-65 hover:data-disabled:bg-transparent';
const labelClasses = 'text-sm text-gray-700';

export const Demo: Story = {
  render: () => ({
    props: {
      log: (v: unknown) => console.log(v),
      active: signal(false),
      selection: signal('first'),
    },
    template: `
      <div radianNavigationMenu>
        <div radianNavigationMenuList>
          <div radianNavigationMenuItem>
            <div radianNavigationMenuTrigger>Links</div>
            <div *radianNavigationMenuContentPresence>

            </div>
          </div>
        </div>
      </div>
    `,
  }),
};
