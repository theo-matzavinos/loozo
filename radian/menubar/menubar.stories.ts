import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianMenubar,
  RadianMenubarArrow,
  RadianMenubarCheckboxItem,
  RadianMenubarContent,
  RadianMenubarGroup,
  RadianMenubarItem,
  RadianMenubarItemIndicator,
  RadianMenubarItemIndicatorPresence,
  RadianMenubarLabel,
  RadianMenubarMenu,
  RadianMenubarPanel,
  RadianMenubarPortal,
  RadianMenubarPresence,
  RadianMenubarRadioGroup,
  RadianMenubarRadioItem,
  RadianMenubarSeparator,
  RadianMenubarSubMenu,
  RadianMenubarSubMenuContent,
  RadianMenubarSubMenuPanel,
  RadianMenubarSubMenuTrigger,
  RadianMenubarTrigger,
} from './src';
import { RadianArrow } from '@loozo/radian/arrow';
import { signal } from '@angular/core';

const meta: Meta<RadianMenubar> = {
  title: 'Menubar',
  component: RadianMenubar,
  subcomponents: {
    RadianMenubarArrow,
    RadianMenubarCheckboxItem,
    RadianMenubarContent,
    RadianMenubarGroup,
    RadianMenubarItem,
    RadianMenubarItemIndicator,
    RadianMenubarItemIndicatorPresence,
    RadianMenubarLabel,
    RadianMenubarMenu,
    RadianMenubarPanel,
    RadianMenubarPortal,
    RadianMenubarPresence,
    RadianMenubarRadioGroup,
    RadianMenubarRadioItem,
    RadianMenubarSeparator,
    RadianMenubarSubMenu,
    RadianMenubarSubMenuContent,
    RadianMenubarSubMenuPanel,
    RadianMenubarSubMenuTrigger,
    RadianMenubarTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianMenubarArrow,
        RadianMenubarCheckboxItem,
        RadianMenubarContent,
        RadianMenubarGroup,
        RadianMenubarItem,
        RadianMenubarItemIndicator,
        RadianMenubarItemIndicatorPresence,
        RadianMenubarLabel,
        RadianMenubarMenu,
        RadianMenubarPanel,
        RadianMenubarPortal,
        RadianMenubarPresence,
        RadianMenubarRadioGroup,
        RadianMenubarRadioItem,
        RadianMenubarSeparator,
        RadianMenubarSubMenu,
        RadianMenubarSubMenuContent,
        RadianMenubarSubMenuPanel,
        RadianMenubarSubMenuTrigger,
        RadianMenubarTrigger,
        RadianArrow,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianMenubar>;

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
      <div class="flex gap-2" radianMenubar>
        <div radianMenubarMenu>
          <button class="${triggerClasses}" radianMenubarTrigger>Menu</button>

          <div *radianMenubarPresence radianMenubarPortal>
            <div radianMenubarPanel>
              <div radianMenubarContent class="${contentClasses}">
                <div radianMenubarGroup>
                  <div radianMenubarLabel class="${labelClasses}">Actions</div>
                  <div radianMenubarItem class="${itemClasses}" (select)="log('undo')">
                    Undo
                  </div>
                  <div radianMenubarItem class="${itemClasses}" (select)="log('undo')">
                    Redo
                  </div>
                </div>
                <div radianMenubarSeparator class="${separatorClasses}"></div>
                <div radianMenubarSubMenu>
                  <div radianMenubarSubMenuTrigger>Submenu →</div>
                  <div *radianMenubarPresence>
                    <div radianMenubarSubMenuPanel sideOffset="12" alignOffset="-6">
                      <div radianMenubarSubMenuContent class="${contentClasses}">
                        <div radianMenubarItem class="${itemClasses}" (select)="log('one')">One</div>
                        <div radianMenubarItem class="${itemClasses}" (select)="log('two')">Two</div>
                        <div radianMenubarItem class="${itemClasses}" (select)="log('three')">Three</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div radianMenubarSeparator class="${separatorClasses}"></div>
                <div radianMenubarItem class="${itemClasses}" disabled (select)="log('four')">Four</div>
                <div radianMenubarCheckboxItem class="${itemClasses}" [(checked)]="active">
                  Active
                  <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
                <div radianMenubarSeparator class="${separatorClasses}"></div>
                <div radianMenubarRadioGroup [(value)]="selection">
                  <div radianMenubarLabel class="${labelClasses}">Selection</div>
                  <div radianMenubarRadioItem class="${itemClasses}" value="first">
                    First
                    <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
                  <div radianMenubarRadioItem class="${itemClasses}" value="second">
                    Second
                    <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
                  <div radianMenubarRadioItem class="${itemClasses}" value="third">
                    Third
                    <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
        <div radianMenubarMenu>
          <button class="${triggerClasses}" radianMenubarTrigger>Menu</button>

          <div *radianMenubarPresence radianMenubarPortal>
            <div radianMenubarPanel>
              <div radianMenubarContent class="${contentClasses}">
                <div radianMenubarGroup>
                  <div radianMenubarLabel class="${labelClasses}">Actions</div>
                  <div radianMenubarItem class="${itemClasses}" (select)="log('undo')">
                    Undo
                  </div>
                  <div radianMenubarItem class="${itemClasses}" (select)="log('undo')">
                    Redo
                  </div>
                </div>
                <div radianMenubarSeparator class="${separatorClasses}"></div>
                <div radianMenubarSubMenu>
                  <div radianMenubarSubMenuTrigger>Submenu →</div>
                  <div *radianMenubarPresence>
                    <div radianMenubarSubMenuPanel sideOffset="12" alignOffset="-6">
                      <div radianMenubarSubMenuContent class="${contentClasses}">
                        <div radianMenubarItem class="${itemClasses}" (select)="log('one')">One</div>
                        <div radianMenubarItem class="${itemClasses}" (select)="log('two')">Two</div>
                        <div radianMenubarItem class="${itemClasses}" (select)="log('three')">Three</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div radianMenubarSeparator class="${separatorClasses}"></div>
                <div radianMenubarItem class="${itemClasses}" disabled (select)="log('four')">Four</div>
                <div radianMenubarCheckboxItem class="${itemClasses}" [(checked)]="active">
                  Active
                  <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
                <div radianMenubarSeparator class="${separatorClasses}"></div>
                <div radianMenubarRadioGroup [(value)]="selection">
                  <div radianMenubarLabel class="${labelClasses}">Selection</div>
                  <div radianMenubarRadioItem class="${itemClasses}" value="first">
                    First
                    <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
                  <div radianMenubarRadioItem class="${itemClasses}" value="second">
                    Second
                    <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
                  <div radianMenubarRadioItem class="${itemClasses}" value="third">
                    Third
                    <div *radianMenubarItemIndicatorPresence radianMenubarItemIndicator>
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
      </div>
    `,
  }),
};
