import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianContextMenu,
  RadianContextMenuArrow,
  RadianContextMenuCheckboxItem,
  RadianContextMenuContent,
  RadianContextMenuGroup,
  RadianContextMenuItem,
  RadianContextMenuItemIndicator,
  RadianContextMenuItemIndicatorPresence,
  RadianContextMenuLabel,
  RadianContextMenuPanel,
  RadianContextMenuPortal,
  RadianContextMenuPresence,
  RadianContextMenuRadioGroup,
  RadianContextMenuRadioItem,
  RadianContextMenuSeparator,
  RadianContextMenuTrigger,
  RadianContextSubMenu,
  RadianContextSubMenuContent,
  RadianContextSubMenuPanel,
  RadianContextSubMenuTrigger,
} from './src';
import { RadianArrow } from '@loozo/radian/arrow';
import { signal } from '@angular/core';

const meta: Meta<RadianContextMenu> = {
  title: 'Context Menu',
  component: RadianContextMenu,
  subcomponents: {
    RadianContextMenuArrow,
    RadianContextMenuCheckboxItem,
    RadianContextMenuContent,
    RadianContextMenuGroup,
    RadianContextMenuItem,
    RadianContextMenuItemIndicator,
    RadianContextMenuItemIndicatorPresence,
    RadianContextMenuLabel,
    RadianContextMenuPanel,
    RadianContextMenuPortal,
    RadianContextMenuPresence,
    RadianContextMenuRadioGroup,
    RadianContextMenuRadioItem,
    RadianContextMenuSeparator,
    RadianContextMenuTrigger,
    RadianContextSubMenu,
    RadianContextSubMenuContent,
    RadianContextSubMenuPanel,
    RadianContextSubMenuTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianContextMenuArrow,
        RadianContextMenuCheckboxItem,
        RadianContextMenuContent,
        RadianContextMenuGroup,
        RadianContextMenuItem,
        RadianContextMenuItemIndicator,
        RadianContextMenuItemIndicatorPresence,
        RadianContextMenuLabel,
        RadianContextMenuPanel,
        RadianContextMenuPortal,
        RadianContextMenuPresence,
        RadianContextMenuRadioGroup,
        RadianContextMenuRadioItem,
        RadianContextMenuSeparator,
        RadianContextMenuTrigger,
        RadianContextSubMenu,
        RadianContextSubMenuContent,
        RadianContextSubMenuPanel,
        RadianContextSubMenuTrigger,
        RadianArrow,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianContextMenu>;

const triggerClasses = 'w-8 h-8 border border-black';
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
      <div radianContextMenu>
        <div class="${triggerClasses}" radianContextMenuTrigger></div>

        <div *radianContextMenuPresence radianContextMenuPortal>
          <div radianContextMenuPanel>
            <div radianContextMenuContent class="${contentClasses}">
              <div radianContextMenuGroup>
                <div radianContextMenuLabel class="${labelClasses}">Actions</div>
                <div radianContextMenuItem class="${itemClasses}" (select)="log('undo')">
                  Undo
                </div>
                <div radianContextMenuItem class="${itemClasses}" (select)="log('undo')">
                  Redo
                </div>
              </div>
              <div radianContextMenuSeparator class="${separatorClasses}"></div>
              <div radianContextSubMenu>
                <div radianContextSubMenuTrigger>Submenu →</div>
                <div *radianContextMenuPresence>
                  <div radianContextSubMenuPanel sideOffset="12" alignOffset="-6">
                    <div radianContextSubMenuContent class="${contentClasses}">
                      <div radianContextMenuItem class="${itemClasses}" (select)="log('one')">One</div>
                      <div radianContextMenuItem class="${itemClasses}" (select)="log('two')">Two</div>
                      <div radianContextMenuItem class="${itemClasses}" (select)="log('three')">Three</div>
                    </div>
                  </div>
                </div>
              </div>
              <div radianContextMenuSeparator class="${separatorClasses}"></div>
              <div radianContextMenuItem class="${itemClasses}" disabled (select)="log('four')">Four</div>
              <div radianContextMenuCheckboxItem class="${itemClasses}" [(checked)]="active">
                Active
                <div *radianContextMenuItemIndicatorPresence radianContextMenuItemIndicator>
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
              <div radianContextMenuSeparator class="${separatorClasses}"></div>
              <div radianContextMenuRadioGroup [(value)]="selection">
                <div radianContextMenuLabel class="${labelClasses}">Selection</div>
                <div radianContextMenuRadioItem class="${itemClasses}" value="first">
                  First
                  <div *radianContextMenuItemIndicatorPresence radianContextMenuItemIndicator>
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
                <div radianContextMenuRadioItem class="${itemClasses}" value="second">
                  Second
                  <div *radianContextMenuItemIndicatorPresence radianContextMenuItemIndicator>
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
                <div radianContextMenuRadioItem class="${itemClasses}" value="third">
                  Third
                  <div *radianContextMenuItemIndicatorPresence radianContextMenuItemIndicator>
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
