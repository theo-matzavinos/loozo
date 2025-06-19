import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianDialog,
  RadianDialogClose,
  RadianDialogContent,
  RadianDialogDescription,
  RadianDialogOverlay,
  RadianDialogPortal,
  RadianDialogPresence,
  RadianDialogTitle,
  RadianDialogTrigger,
} from './src';
import { signal } from '@angular/core';

const meta: Meta<RadianDialog> = {
  title: ' Dialog',
  component: RadianDialog,
  subcomponents: {
    RadianDialogClose,
    RadianDialogContent,
    RadianDialogDescription,
    RadianDialogOverlay,
    RadianDialogPortal,
    RadianDialogPresence,
    RadianDialogTitle,
    RadianDialogTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianDialogClose,
        RadianDialogContent,
        RadianDialogDescription,
        RadianDialogOverlay,
        RadianDialogPortal,
        RadianDialogPresence,
        RadianDialogTitle,
        RadianDialogTrigger,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianDialog>;

const overlayClasses = 'fixed inset-0 z-10 bg-black/50';
const contentClasses =
  'bg-white fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg';
const footerClasses = 'flex gap-2 justify-end';

export const Uncontrolled: Story = {
  args: {},
  render: () => ({
    template: `
      <ng-container radianDialog>
        <button radianDialogTrigger>Open</button>

        <div *radianDialogPresence radianDialogPortal>
          <div class="${overlayClasses}" radianDialogOverlay></div>

          <div class="${contentClasses}" radianDialogContent>
            <h3 radianDialogTitle>This is a dialog</h3>
            <p radianDialogDescription>It is very useful.</p>

            <div class="${footerClasses}">
              <button radianDialogClose>Close</button>
            </div>
          </div>
        </div>
      </ng-container>
    `,
  }),
};

export const Controlled: Story = {
  render: () => ({
    props: {
      open: signal(true),
    },
    template: `
      <button type="button" (click)="open.set(!open())">Delete</button>

      <ng-container radianDialog [(open)]="open">
        <div *radianDialogPresence radianDialogPortal>
          <div class="${overlayClasses}" radianDialogOverlay></div>

          <div class="${contentClasses}" radianDialogContent>
            <h3 radianDialogTitle>This is a dialog</h3>
            <p radianDialogDescription>It is very useful.</p>

            <div class="${footerClasses}">
              <button radianDialogClose>Close</button>
            </div>
          </div>
        </div>
      </ng-container>
    `,
  }),
};
