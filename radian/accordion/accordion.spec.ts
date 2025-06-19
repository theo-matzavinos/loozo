import 'vitest-axe/extend-expect';
import { axe } from 'vitest-axe';
import type { RenderResult } from '@testing-library/angular';
import { render, fireEvent } from '@testing-library/angular';
import * as Accordion from './src';
import type { Mock } from 'vitest';
import { afterEach, describe, it, beforeEach, vi, expect } from 'vitest';
import { RadianAccordion } from './src';
import { Component } from '@angular/core';

@Component({
  imports: [Accordion.RadianAccordionImports],
  hostDirectives: [
    {
      directive: RadianAccordion,
      inputs: [
        'orientation',
        'dir',
        'value',
        'multiple',
        'defaultValue',
        'collapsible',
      ],
    },
  ],
  template: `
    <div radianAccordionItem value="one">
      <h3 radianAccordionHeader>
        <button radianAccordionTrigger>One</button>
      </h3>
      <div radianAccordionContent>
        Per erat orci nostra luctus sociosqu mus risus penatibus, duis elit
        vulputate viverra integer ullamcorper congue curabitur sociis, nisi
        malesuada scelerisque quam suscipit habitant sed.
      </div>
    </div>
    <div radianAccordionItem value="two">
      <h3 radianAccordionHeader>
        <button radianAccordionTrigger>Two</button>
      </h3>
      <div radianAccordionContent>
        Cursus sed mattis commodo fermentum conubia ipsum pulvinar sagittis,
        diam eget bibendum porta nascetur ac dictum, leo tellus dis integer
        platea ultrices mi.
      </div>
    </div>
    <div radianAccordionItem value="three" disabled>
      <h3 radianAccordionHeader>
        <button radianAccordionTrigger>Three (disabled)</button>
      </h3>
      <div radianAccordionContent>
        Sociis hac sapien turpis conubia sagittis justo dui, inceptos penatibus
        feugiat himenaeos euismod magna, nec tempor pulvinar eu etiam mattis.
      </div>
    </div>
    <div radianAccordionItem value="four">
      <h3 radianAccordionHeader>
        <button radianAccordionTrigger>Four</button>
      </h3>
      <div radianAccordionContent>
        Odio placerat <a href="#">quisque</a> sapien sagittis non sociis ligula
        penatibus dignissim vitae, enim vulputate nullam semper potenti etiam
        volutpat libero.
        <button>Cool</button>
      </div>
    </div>
  `,
})
class AccordionTest {}

const ITEMS = ['One', 'Two', 'Three'];

describe('given a single Accordion', () => {
  let handleValueChange: Mock;
  let rendered: RenderResult<AccordionTest>;

  describe('with default orientation=vertical', () => {
    beforeEach(async () => {
      handleValueChange = vi.fn();
      rendered = await render(AccordionTest, { inputs: { type: 'single' } });
    });

    it('should have no accessibility violations in default state', async () => {
      expect(await axe(rendered.container)).toHaveNoViolations();
    });

    describe('when navigating by keyboard', () => {
      beforeEach(() => {
        const trigger = rendered.getByText('Trigger One');
        trigger.focus();
      });

      describe('on `ArrowDown`', () => {
        it('should move focus to the next trigger', () => {
          fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
          expect(rendered.getByText('Trigger Two')).toHaveFocus();
        });

        it('should move focus to the first item if at the end', () => {
          const trigger = rendered.getByText('Trigger Three');
          trigger.focus();
          fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
          expect(rendered.getByText('Trigger One')).toHaveFocus();
        });
      });

      describe('on `ArrowUp`', () => {
        it('should move focus to the previous trigger', () => {
          const trigger = rendered.getByText('Trigger Three');
          trigger.focus();
          fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
          expect(rendered.getByText('Trigger Two')).toHaveFocus();
        });

        it('should move focus to the last item if at the beginning', () => {
          const trigger = rendered.getByText('Trigger One');
          trigger.focus();
          fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
          expect(rendered.getByText('Trigger Three')).toHaveFocus();
        });
      });

      describe('on `Home`', () => {
        it('should move focus to the first trigger', () => {
          fireEvent.keyDown(document.activeElement!, { key: 'Home' });
          expect(rendered.getByText('Trigger One')).toHaveFocus();
        });
      });

      describe('on `End`', () => {
        it('should move focus to the last trigger', () => {
          fireEvent.keyDown(document.activeElement!, { key: 'End' });
          expect(rendered.getByText('Trigger Three')).toHaveFocus();
        });
      });
    });

    describe('when clicking a trigger', () => {
      let trigger: HTMLElement;
      let contentOne: HTMLElement | null;

      beforeEach(() => {
        trigger = rendered.getByText('Trigger One');
        fireEvent.click(trigger);
        contentOne = rendered.getByText('Content One');
      });

      it('should show the content', () => {
        expect(contentOne).toBeVisible();
      });

      it('should have no accessibility violations', async () => {
        expect(await axe(rendered.container)).toHaveNoViolations();
      });

      it('should call onValueChange', () => {
        expect(handleValueChange).toHaveBeenCalledWith('One');
      });

      describe('then clicking the trigger again', () => {
        beforeEach(() => {
          fireEvent.click(trigger);
        });

        it('should not close the content', () => {
          expect(contentOne).toBeVisible();
        });

        it('should not call onValueChange', () => {
          expect(handleValueChange).toHaveBeenCalledTimes(1);
        });
      });

      describe('then clicking another trigger', () => {
        beforeEach(() => {
          const trigger = rendered.getByText('Trigger Two');
          fireEvent.click(trigger);
        });

        it('should show the new content', () => {
          const contentTwo = rendered.getByText('Content Two');
          expect(contentTwo).toBeVisible();
        });

        it('should call onValueChange', () => {
          expect(handleValueChange).toHaveBeenCalledWith('Two');
        });

        it('should hide the previous content', () => {
          expect(contentOne).not.toBeVisible();
        });
      });
    });
  });

  describe('with orientation=horizontal', () => {
    describe('and default dir="ltr"', () => {
      beforeEach(async () => {
        handleValueChange = vi.fn();
        rendered = await render(AccordionTest, {
          inputs: { type: 'single', orientation: 'horizontal' },
          on: { valueChange: handleValueChange },
        });
      });

      describe('when navigating by keyboard', () => {
        beforeEach(() => {
          const trigger = rendered.getByText('Trigger One');
          trigger.focus();
        });

        describe('on `ArrowUp`', () => {
          it('should do nothing', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `ArrowDown`', () => {
          it('should do nothing', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `ArrowRight`', () => {
          it('should move focus to the next trigger', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
            expect(rendered.getByText('Trigger Two')).toHaveFocus();
          });

          it('should move focus to the first item if at the end', () => {
            const trigger = rendered.getByText('Trigger Three');
            trigger.focus();
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `ArrowLeft`', () => {
          it('should move focus to the previous trigger', () => {
            const trigger = rendered.getByText('Trigger Three');
            trigger.focus();
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
            expect(rendered.getByText('Trigger Two')).toHaveFocus();
          });

          it('should move focus to the last item if at the beginning', () => {
            const trigger = rendered.getByText('Trigger One');
            trigger.focus();
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
            expect(rendered.getByText('Trigger Three')).toHaveFocus();
          });
        });

        describe('on `Home`', () => {
          it('should move focus to the first trigger', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'Home' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `End`', () => {
          it('should move focus to the last trigger', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'End' });
            expect(rendered.getByText('Trigger Three')).toHaveFocus();
          });
        });
      });
    });

    describe('and dir="rtl"', () => {
      beforeEach(async () => {
        handleValueChange = vi.fn();
        rendered = await render(AccordionTest, {
          inputs: { type: 'single', dir: 'rtl', orientation: 'horizontal' },
          on: { valueChange: handleValueChange },
        });
      });

      describe('when navigating by keyboard', () => {
        beforeEach(() => {
          const trigger = rendered.getByText('Trigger One');
          trigger.focus();
        });

        describe('on `ArrowUp`', () => {
          it('should do nothing', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `ArrowDown`', () => {
          it('should do nothing', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `ArrowRight`', () => {
          it('should move focus to the previous trigger', () => {
            const trigger = rendered.getByText('Trigger Two');
            trigger.focus();
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });

          it('should move focus to the last item if at the beginning', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
            expect(rendered.getByText('Trigger Three')).toHaveFocus();
          });
        });

        describe('on `ArrowLeft`', () => {
          it('should move focus to the next trigger', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
            expect(rendered.getByText('Trigger Two')).toHaveFocus();
          });

          it('should move focus to the first item if at the end', () => {
            const trigger = rendered.getByText('Trigger Three');
            trigger.focus();
            fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `Home`', () => {
          it('should move focus to the first trigger', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'Home' });
            expect(rendered.getByText('Trigger One')).toHaveFocus();
          });
        });

        describe('on `End`', () => {
          it('should move focus to the last trigger', () => {
            fireEvent.keyDown(document.activeElement!, { key: 'End' });
            expect(rendered.getByText('Trigger Three')).toHaveFocus();
          });
        });
      });
    });
  });
});

describe('given a multiple Accordion', () => {
  let handleValueChange: Mock;
  let rendered: RenderResult<AccordionTest>;

  beforeEach(async () => {
    handleValueChange = vi.fn();
    rendered = await render(AccordionTest, {
      inputs: { type: 'multiple' },
      on: { valueChange: handleValueChange },
    });
  });

  it('should have no accessibility violations in default state', async () => {
    expect(await axe(rendered.container)).toHaveNoViolations();
  });

  describe('when navigating by keyboard', () => {
    beforeEach(() => {
      rendered.getByText('Trigger One').focus();
    });

    describe('on `ArrowDown`', () => {
      it('should move focus to the next trigger', () => {
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
        expect(rendered.getByText('Trigger Two')).toHaveFocus();
      });
    });

    describe('on `ArrowUp`', () => {
      it('should move focus to the previous trigger', () => {
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
        expect(rendered.getByText('Trigger Three')).toHaveFocus();
      });
    });

    describe('on `Home`', () => {
      it('should move focus to the first trigger', () => {
        fireEvent.keyDown(document.activeElement!, { key: 'Home' });
        expect(rendered.getByText('Trigger One')).toHaveFocus();
      });
    });

    describe('on `End`', () => {
      it('should move focus to the last trigger', () => {
        fireEvent.keyDown(document.activeElement!, { key: 'End' });
        expect(rendered.getByText('Trigger Three')).toHaveFocus();
      });
    });
  });

  describe('when clicking a trigger', () => {
    let trigger: HTMLElement;
    let contentOne: HTMLElement | null;

    beforeEach(() => {
      trigger = rendered.getByText('Trigger One');
      fireEvent.click(trigger);
      contentOne = rendered.getByText('Content One');
    });

    it('should show the content', () => {
      expect(contentOne).toBeVisible();
    });

    it('should have no accessibility violations', async () => {
      expect(await axe(rendered.container)).toHaveNoViolations();
    });

    it('should call onValueChange', () => {
      expect(handleValueChange).toHaveBeenCalledWith(['One']);
    });

    describe('then clicking the trigger again', () => {
      beforeEach(() => {
        fireEvent.click(trigger);
      });

      it('should hide the content', () => {
        expect(contentOne).not.toBeVisible();
      });

      it('should call onValueChange', () => {
        expect(handleValueChange).toHaveBeenCalledWith([]);
      });
    });

    describe('then clicking another trigger', () => {
      beforeEach(() => {
        const trigger = rendered.getByText('Trigger Two');
        fireEvent.click(trigger);
      });

      it('should show the new content', () => {
        const contentTwo = rendered.getByText('Content Two');
        expect(contentTwo).toBeVisible();
      });

      it('should call onValueChange', () => {
        expect(handleValueChange).toHaveBeenCalledWith(['One', 'Two']);
      });

      it('should not hide the previous content', () => {
        expect(contentOne).toBeVisible();
      });
    });
  });
});
