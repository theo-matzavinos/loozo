import {
  booleanAttribute,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RadianTabsGroupContext } from './tabs-group-context';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';
import { RadianTab } from './tab';

@Directive({
  selector: '[radianTabTrigger]',
  exportAs: 'radianTabTrigger',
  providers: [
    provideRadianFocusableContext(() => {
      const tabTrigger = inject(RadianTabTrigger);

      return {
        value: computed(() => tabTrigger.tab().triggerId()),
      };
    }),
  ],
  hostDirectives: [
    {
      directive: RadianFocusable,
      inputs: ['disabled'],
    },
  ],
  host: {
    type: 'button',
    role: 'tab',
    '[id]': 'tab().triggerId()',
    '[disabled]': 'disabled()',
    '[attr.aria-selected]': 'tab().isActive()',
    '[attr.aria-controls]': 'tab().contentId()',
    '[attr.data-state]': 'tab().state()',
    '[attr.data-disabled]': 'disabled() || null',
    '[tabIndex]': 'tab().isActive() ? 0 : -1',
    '(keydown.enter)': 'tabs.setActive(tab().value())',
    '(keydown.space)': 'tabs.setActive(tab().value())',
    '(mousedown)': 'mouseDown($event)',
    '(focus)': 'focused()',
  },
})
export class RadianTabTrigger {
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /** The RadianTabContent this trigger controls. */
  tab = input.required<RadianTab>({ alias: 'for' });

  protected context = inject(RadianTabsGroupContext);
  private button = viewChild.required<ElementRef<HTMLButtonElement>>('button');

  /** @internal */
  focus(): void {
    this.button().nativeElement.focus();
  }

  protected mouseDown(event: MouseEvent) {
    // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
    // but not when the control key is pressed (avoiding MacOS right click)
    if (!this.disabled() && event.button === 0 && event.ctrlKey === false) {
      this.context.setActive(this.tab().value());
    } else {
      // prevent focus to avoid accidental activation
      event.preventDefault();
    }
  }

  protected focused() {
    // handle "automatic" activation if necessary
    // ie. activate tab following focus
    const isAutomaticActivation = this.context.activationMode() !== 'manual';

    if (!this.tab().isActive() && !this.disabled() && isAutomaticActivation) {
      this.context.setActive(this.tab().value());
    }
  }
}
