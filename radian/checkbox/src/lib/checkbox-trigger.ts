import { Directive, ElementRef, inject } from '@angular/core';
import { RadianCheckboxContext } from './checkbox';

@Directive({
  selector: 'button[radianCheckboxTrigger]',
  host: {
    type: 'button',
    role: 'checkbox',
    'data-radian-checkbox-trigger': '',
    '[disabled]': 'context.disabled()',
    '[attr.aria-checked]':
      'context.checked() === "indeterminate" ? "mixed" : context.checked()',
    '[attr.aria-required]': 'context.required() || null',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled() || null',
    '[value]': 'context.value()',
    '(click)': 'clicked($event)',
    // According to WAI ARIA, Checkboxes don't activate on enter keypress
    '(keydown.enter)': '$event.preventDefault()',
  },
})
export class RadianCheckboxTrigger {
  protected context = inject(RadianCheckboxContext);

  private elementRef = inject<ElementRef<HTMLButtonElement>>(ElementRef);

  protected clicked(event: MouseEvent) {
    this.context.toggle();

    if (this.context.form() || this.elementRef.nativeElement.closest('form')) {
      // if checkbox is in a form, stop propagation from the button so that we only propagate
      // one click event (from the input). We propagate changes from an input so that native
      // form validation works and form events reflect checkbox updates.
      event.stopPropagation();
    }
  }
}
