import {
  computed,
  Component,
  inject,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ClassValue } from 'clsx';
import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { LoozoField } from '@loozo/forms';
import { mergeClasses } from '../merge-classes';

/** Component that contains a field. */
@Component({
  selector: 'app-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: LoozoField,
      inputs: ['name', 'type'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
  },
  imports: [NgTemplateOutlet, JsonPipe],
  template: `
    <ng-content />

    @if (loozoField.touched() && loozoField.validationMessages().length) {
      <ng-container [ngTemplateOutlet]="loozoField.validationMessages()[0]" />
    }
  `,
})
export class Field<T> {
  /** @internal */
  class = input<ClassValue>();

  loozoField = inject<LoozoField<T>>(LoozoField);

  protected computedClass = computed(() =>
    mergeClasses('block relative group/field pb-5', this.class()),
  );
}
