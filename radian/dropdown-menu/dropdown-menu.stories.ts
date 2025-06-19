import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianDropdownMenu,
  RadianDropdownMenuArrow,
  RadianDropdownMenuCheckboxItem,
  RadianDropdownMenuContent,
  RadianDropdownMenuGroup,
  RadianDropdownMenuItem,
  RadianDropdownMenuItemIndicator,
  RadianDropdownMenuItemIndicatorPresence,
  RadianDropdownMenuLabel,
  RadianDropdownMenuPanel,
  RadianDropdownMenuPortal,
  RadianDropdownMenuPresence,
  RadianDropdownMenuRadioGroup,
  RadianDropdownMenuRadioItem,
  RadianDropdownMenuSeparator,
  RadianDropdownMenuTrigger,
  RadianDropdownSubMenu,
  RadianDropdownSubMenuContent,
  RadianDropdownSubMenuPanel,
  RadianDropdownSubMenuTrigger,
} from './src';
import { RadianArrow } from '@loozo/radian/arrow';
import { signal } from '@angular/core';

const meta: Meta<RadianDropdownMenu> = {
  title: 'Dropdown Menu',
  component: RadianDropdownMenu,
  subcomponents: {
    RadianDropdownMenuArrow,
    RadianDropdownMenuCheckboxItem,
    RadianDropdownMenuContent,
    RadianDropdownMenuGroup,
    RadianDropdownMenuItem,
    RadianDropdownMenuItemIndicator,
    RadianDropdownMenuItemIndicatorPresence,
    RadianDropdownMenuLabel,
    RadianDropdownMenuPanel,
    RadianDropdownMenuPortal,
    RadianDropdownMenuPresence,
    RadianDropdownMenuRadioGroup,
    RadianDropdownMenuRadioItem,
    RadianDropdownMenuSeparator,
    RadianDropdownMenuTrigger,
    RadianDropdownSubMenu,
    RadianDropdownSubMenuContent,
    RadianDropdownSubMenuPanel,
    RadianDropdownSubMenuTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianDropdownMenuArrow,
        RadianDropdownMenuCheckboxItem,
        RadianDropdownMenuContent,
        RadianDropdownMenuGroup,
        RadianDropdownMenuItem,
        RadianDropdownMenuItemIndicator,
        RadianDropdownMenuItemIndicatorPresence,
        RadianDropdownMenuLabel,
        RadianDropdownMenuPanel,
        RadianDropdownMenuPortal,
        RadianDropdownMenuPresence,
        RadianDropdownMenuRadioGroup,
        RadianDropdownMenuRadioItem,
        RadianDropdownMenuSeparator,
        RadianDropdownMenuTrigger,
        RadianDropdownSubMenu,
        RadianDropdownSubMenuContent,
        RadianDropdownSubMenuPanel,
        RadianDropdownSubMenuTrigger,
        RadianArrow,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianDropdownMenu>;

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
      <div radianDropdownMenu>
        <button class="${triggerClasses}" radianDropdownMenuTrigger>Menu</button>

        <div *radianDropdownMenuPresence radianDropdownMenuPortal>
          <div radianDropdownMenuPanel>
            <div radianDropdownMenuContent class="${contentClasses}">
              <div radianDropdownMenuGroup>
                <div radianDropdownMenuLabel class="${labelClasses}">Actions</div>
                <div radianDropdownMenuItem class="${itemClasses}" (select)="log('undo')">
                  Undo
                </div>
                <div radianDropdownMenuItem class="${itemClasses}" (select)="log('undo')">
                  Redo
                </div>
              </div>
              <div radianDropdownMenuSeparator class="${separatorClasses}"></div>
              <div radianDropdownSubMenu>
                <div radianDropdownSubMenuTrigger>Submenu →</div>
                <div *radianDropdownMenuPresence>
                  <div radianDropdownSubMenuPanel sideOffset="12" alignOffset="-6">
                    <div radianDropdownSubMenuContent class="${contentClasses}">
                      <div radianDropdownMenuItem class="${itemClasses}" (select)="log('one')">One</div>
                      <div radianDropdownMenuItem class="${itemClasses}" (select)="log('two')">Two</div>
                      <div radianDropdownMenuItem class="${itemClasses}" (select)="log('three')">Three</div>
                    </div>
                  </div>
                </div>
              </div>
              <div radianDropdownMenuSeparator class="${separatorClasses}"></div>
              <div radianDropdownMenuItem class="${itemClasses}" disabled (select)="log('four')">Four</div>
              <div radianDropdownMenuCheckboxItem class="${itemClasses}" [(checked)]="active">
                Active
                <div *radianDropdownMenuItemIndicatorPresence radianDropdownMenuItemIndicator>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 32 32"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentcolor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    >
                      <path d="M2 20 L12 28 30 4" />
                    </svg>
                </div>
              </div>
              <div radianDropdownMenuSeparator class="${separatorClasses}"></div>
              <div radianDropdownMenuRadioGroup [(value)]="selection">
                <div radianDropdownMenuLabel class="${labelClasses}">Selection</div>
                <div radianDropdownMenuRadioItem class="${itemClasses}" value="first">
                  First
                  <div *radianDropdownMenuItemIndicatorPresence radianDropdownMenuItemIndicator>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 32 32"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentcolor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    >
                      <path d="M2 20 L12 28 30 4" />
                    </svg>
                  </div>
                </div>
                <div radianDropdownMenuRadioItem class="${itemClasses}" value="second">
                  Second
                  <div *radianDropdownMenuItemIndicatorPresence radianDropdownMenuItemIndicator>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 32 32"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentcolor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    >
                      <path d="M2 20 L12 28 30 4" />
                    </svg>
                  </div>
                </div>
                <div radianDropdownMenuRadioItem class="${itemClasses}" value="third">
                  Third
                  <div *radianDropdownMenuItemIndicatorPresence radianDropdownMenuItemIndicator>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 32 32"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentcolor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    >
                      <path d="M2 20 L12 28 30 4" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};
