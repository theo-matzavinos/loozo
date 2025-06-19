import { Directive, ElementRef, inject } from '@angular/core';
import { RadianRadioContext } from './radio-context';

@Directive({
  selector: '[radianRadioTrigger]',
  host: {
    type: 'button',
    role: 'radio',
    '[disabled]': 'context.disabled()',
    '[attr.aria-checked]': '!!context.checked()',
    '[attr.aria-required]': 'context.required() || null',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled() || null',
    '[value]': 'context.value()',
    '(click)': 'clicked($event)',
  },
})
export class RadianRadioTrigger {
  protected context = inject(RadianRadioContext);

  private elementRef = inject<ElementRef<HTMLButtonElement>>(ElementRef);

  protected clicked(event: MouseEvent) {
    this.context.toggle();

    if (this.context.form() || this.elementRef.nativeElement.closest('form')) {
      // if radio is in a form, stop propagation from the button so that we only propagate
      // one click event (from the input). We propagate changes from an input so that native
      // form validation works and form events reflect radio updates.
      event.stopPropagation();
    }
  }
}
