import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianAlertDialog,
  RadianAlertDialogAction,
  RadianAlertDialogCancel,
  RadianAlertDialogContent,
  RadianAlertDialogDescription,
  RadianAlertDialogOverlay,
  RadianAlertDialogPortal,
  RadianAlertDialogPresence,
  RadianAlertDialogTitle,
  RadianAlertDialogTrigger,
} from './src';
import { signal } from '@angular/core';

const meta: Meta<RadianAlertDialog> = {
  title: 'Alert Dialog',
  component: RadianAlertDialog,
  subcomponents: {
    RadianAlertDialogAction,
    RadianAlertDialogCancel,
    RadianAlertDialogContent,
    RadianAlertDialogDescription,
    RadianAlertDialogOverlay,
    RadianAlertDialogPortal,
    RadianAlertDialogPresence,
    RadianAlertDialogTitle,
    RadianAlertDialogTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianAlertDialogAction,
        RadianAlertDialogCancel,
        RadianAlertDialogContent,
        RadianAlertDialogDescription,
        RadianAlertDialogOverlay,
        RadianAlertDialogPortal,
        RadianAlertDialogPresence,
        RadianAlertDialogTitle,
        RadianAlertDialogTrigger,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianAlertDialog>;

const overlayClasses = 'fixed inset-0 z-10 bg-black/50';
const contentClasses =
  'bg-white fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg';
const footerClasses = 'flex gap-2 justify-end';

export const Uncontrolled: Story = {
  args: {},
  render: () => ({
    template: `
      <ng-container radianAlertDialog>
        <button radianAlertDialogTrigger>Delete</button>

        <div *radianAlertDialogPresence radianAlertDialogPortal>
          <div class="${overlayClasses}" radianAlertDialogOverlay></div>

          <div class="${contentClasses}" radianAlertDialogContent>
            <h3 radianAlertDialogTitle>Are you sure?</h3>
            <p radianAlertDialogDescription>There is no going back!</p>

            <div class="${footerClasses}">
              <button radianAlertDialogAction>Delete</button>
              <button radianAlertDialogCancel>Cancel</button>
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

      <ng-container radianAlertDialog [(open)]="open">
        <div *radianAlertDialogPresence radianAlertDialogPortal>
          <div class="${overlayClasses}" radianAlertDialogOverlay></div>

          <div class="${contentClasses}" radianAlertDialogContent>
            <h3 radianAlertDialogTitle>Are you sure?</h3>
            <p radianAlertDialogDescription>There is no going back!</p>

            <div class="${footerClasses}">
              <button radianAlertDialogAction>Delete</button>
              <button radianAlertDialogCancel>Cancel</button>
            </div>
          </div>
        </div>
      </ng-container>
    `,
  }),
};
