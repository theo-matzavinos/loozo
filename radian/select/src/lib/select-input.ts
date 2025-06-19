import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
} from '@angular/core';
import { RadianSelectContext } from './select-context';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: '[radianSelectInput]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': '',
    tabindex: '-1',
    '[attr.required]': 'context.required() ? "" : null',
    '[attr.name]': 'context.name()',
    '[attr.autocomplete]': 'context.autoComplete()',
    '[attr.value]': 'context.multiple ? null : context.value()',
    '[disabled]': 'context.disabled()',
    '[attr.form]': 'context.form()',
    '(change)': 'valueChanged()',
  },
  template: `
    @if (context.value() === undefined) {
      <option value=""></option>
    }
    @for (value of context.options(); track value) {
      <option
        [value]="value"
        [attr.selected]="
          context.multiple && context.value()?.includes(value.value())
            ? ''
            : null
        "
      ></option>
    }
  `,
})
export class RadianSelectInput {
  protected context = inject(RadianSelectContext);

  private elementRef: ElementRef<HTMLSelectElement> = inject(ElementRef);

  protected valueChanged() {
    if (this.context.multiple) {
      this.context.setValue(
        Array.from(
          this.elementRef.nativeElement.selectedOptions,
          (o) => o.value,
        ),
      );
    } else {
      this.context.setValue(this.elementRef.nativeElement.value);
    }
  }
}
