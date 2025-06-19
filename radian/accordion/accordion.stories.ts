import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';

import {
  RadianAccordion,
  RadianAccordionContent,
  RadianAccordionHeader,
  RadianAccordionItem,
  RadianAccordionPresence,
  RadianAccordionTrigger,
} from './src';
import { signal } from '@angular/core';

const meta: Meta<RadianAccordion> = {
  title: 'Accordion',
  component: RadianAccordion,
  subcomponents: {
    RadianAccordionContent,
    RadianAccordionHeader,
    RadianAccordionItem,
    RadianAccordionPresence,
    RadianAccordionTrigger,
  },
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        RadianAccordionContent,
        RadianAccordionHeader,
        RadianAccordionItem,
        RadianAccordionPresence,
        RadianAccordionTrigger,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<RadianAccordion>;

const accordionItemClasses = 'border-b last:border-b-0';
const accordionHeaderClasses = 'flex';
const accordionTriggerClasses =
  'flex flex-1 items-start justify-between gap-4 py-4 text-left text-sm font-medium outline-none hover:underline disabled:pointer-events-none disabled:opacity-50';

export const SingleUncontrolled: Story = {
  name: 'Single - Uncontrolled',
  render: () => ({
    template: `
      <div class="${accordionItemClasses}" radianAccordion>
        <div class="${accordionItemClasses}" radianAccordionItem value="one">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>One</button>
          </h3>
          <div radianAccordionContent>
            Per erat orci nostra luctus sociosqu mus risus penatibus, duis elit vulputate viverra
            integer ullamcorper congue curabitur sociis, nisi malesuada scelerisque quam suscipit
            habitant sed.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="two">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Two</button>
          </h3>
          <div radianAccordionContent>
            Cursus sed mattis commodo fermentum conubia ipsum pulvinar sagittis, diam eget bibendum
            porta nascetur ac dictum, leo tellus dis integer platea ultrices mi.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="three" disabled>
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Three (disabled)</button>
          </h3>
          <div radianAccordionContent>
            Sociis hac sapien turpis conubia sagittis justo dui, inceptos penatibus feugiat
            himenaeos euismod magna, nec tempor pulvinar eu etiam mattis.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="four">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Four</button>
          </h3>
          <div radianAccordionContent>
            Odio placerat <a href="#">quisque</a> sapien sagittis non sociis ligula penatibus
            dignissim vitae, enim vulputate nullam semper potenti etiam volutpat libero.
            <button>Cool</button>
          </div>
        </div>
      </div>`,
  }),
};

export const SingleControlled: Story = {
  name: 'Single - Controlled',
  render: () => ({
    props: {
      active: signal('one'),
    },
    template: `
      <div radianAccordion

        [(value)]="active"
      >
        <div class="${accordionItemClasses}" radianAccordionItem value="one">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>One</button>
          </h3>
          <div radianAccordionContent>
            Per erat orci nostra luctus sociosqu mus risus penatibus, duis elit vulputate viverra
            integer ullamcorper congue curabitur sociis, nisi malesuada scelerisque quam suscipit
            habitant sed.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="two">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Two</button>
          </h3>
          <div radianAccordionContent>
            Cursus sed mattis commodo fermentum conubia ipsum pulvinar sagittis, diam eget bibendum
            porta nascetur ac dictum, leo tellus dis integer platea ultrices mi.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="three" disabled>
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Three (disabled)</button>
          </h3>
          <div radianAccordionContent>
            Sociis hac sapien turpis conubia sagittis justo dui, inceptos penatibus feugiat
            himenaeos euismod magna, nec tempor pulvinar eu etiam mattis.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="four">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Four</button>
          </h3>
          <div radianAccordionContent>
            Odio placerat <a href="#">quisque</a> sapien sagittis non sociis ligula penatibus
            dignissim vitae, enim vulputate nullam semper potenti etiam volutpat libero.
            <button>Cool</button>
          </div>
        </div>
      </div>`,
  }),
};

export const SingleCollapsible: Story = {
  name: 'Single - Collapsible',
  render: () => ({
    template: `
      <div radianAccordion value="one" collapsible>
        <div class="${accordionItemClasses}" radianAccordionItem value="one">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>One</button>
          </h3>
          <div radianAccordionContent>
            Per erat orci nostra luctus sociosqu mus risus penatibus, duis elit vulputate viverra
            integer ullamcorper congue curabitur sociis, nisi malesuada scelerisque quam suscipit
            habitant sed.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="two">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Two</button>
          </h3>
          <div radianAccordionContent>
            Cursus sed mattis commodo fermentum conubia ipsum pulvinar sagittis, diam eget bibendum
            porta nascetur ac dictum, leo tellus dis integer platea ultrices mi.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="three" disabled>
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Three (disabled)</button>
          </h3>
          <div radianAccordionContent>
            Sociis hac sapien turpis conubia sagittis justo dui, inceptos penatibus feugiat
            himenaeos euismod magna, nec tempor pulvinar eu etiam mattis.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="four">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Four</button>
          </h3>
          <div radianAccordionContent>
            Odio placerat <a href="#">quisque</a> sapien sagittis non sociis ligula penatibus
            dignissim vitae, enim vulputate nullam semper potenti etiam volutpat libero.
            <button>Cool</button>
          </div>
        </div>
      </div>`,
  }),
};

export const MultipleUncontrolled: Story = {
  name: 'Multiple - Uncontrolled',
  render: () => ({
    template: `
      <div class="${accordionItemClasses}" radianAccordion multiple>
        <div class="${accordionItemClasses}" radianAccordionItem value="one">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>One</button>
          </h3>
          <div radianAccordionContent>
            Per erat orci nostra luctus sociosqu mus risus penatibus, duis elit vulputate viverra
            integer ullamcorper congue curabitur sociis, nisi malesuada scelerisque quam suscipit
            habitant sed.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="two">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Two</button>
          </h3>
          <div radianAccordionContent>
            Cursus sed mattis commodo fermentum conubia ipsum pulvinar sagittis, diam eget bibendum
            porta nascetur ac dictum, leo tellus dis integer platea ultrices mi.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="three" disabled>
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Three (disabled)</button>
          </h3>
          <div radianAccordionContent>
            Sociis hac sapien turpis conubia sagittis justo dui, inceptos penatibus feugiat
            himenaeos euismod magna, nec tempor pulvinar eu etiam mattis.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="four">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Four</button>
          </h3>
          <div radianAccordionContent>
            Odio placerat <a href="#">quisque</a> sapien sagittis non sociis ligula penatibus
            dignissim vitae, enim vulputate nullam semper potenti etiam volutpat libero.
            <button>Cool</button>
          </div>
        </div>
      </div>`,
  }),
};

export const MultipleControlled: Story = {
  name: 'Multiple - Controlled',
  render: () => ({
    props: {
      active: signal('one'),
    },
    template: `
      <div radianAccordion
        multiple
        [(value)]="active"
      >
        <div class="${accordionItemClasses}" radianAccordionItem value="one">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>One</button>
          </h3>
          <div radianAccordionContent>
            Per erat orci nostra luctus sociosqu mus risus penatibus, duis elit vulputate viverra
            integer ullamcorper congue curabitur sociis, nisi malesuada scelerisque quam suscipit
            habitant sed.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="two">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Two</button>
          </h3>
          <div radianAccordionContent>
            Cursus sed mattis commodo fermentum conubia ipsum pulvinar sagittis, diam eget bibendum
            porta nascetur ac dictum, leo tellus dis integer platea ultrices mi.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="three" disabled>
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Three (disabled)</button>
          </h3>
          <div radianAccordionContent>
            Sociis hac sapien turpis conubia sagittis justo dui, inceptos penatibus feugiat
            himenaeos euismod magna, nec tempor pulvinar eu etiam mattis.
          </div>
        </div>
        <div class="${accordionItemClasses}" radianAccordionItem value="four">
          <h3 class="${accordionHeaderClasses}" radianAccordionHeader>
            <button class="${accordionTriggerClasses}" radianAccordionTrigger>Four</button>
          </h3>
          <div radianAccordionContent>
            Odio placerat <a href="#">quisque</a> sapien sagittis non sociis ligula penatibus
            dignissim vitae, enim vulputate nullam semper potenti etiam volutpat libero.
            <button>Cool</button>
          </div>
        </div>
      </div>`,
  }),
};
