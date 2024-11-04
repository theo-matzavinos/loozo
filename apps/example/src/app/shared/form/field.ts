import {
  computed,
  Component,
  inject,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ClassValue } from 'clsx';
import { NgTemplateOutlet } from '@angular/common';
import { LoozoField, LoozoFieldLabel } from '@loozo/forms';
import { mergeClasses } from '../merge-classes';

/** Component that contains a field. */
@Component({
  selector: 'app-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: LoozoField,
      inputs: ['loozoField:name', 'type'],
      outputs: ['valueChange', 'statusChange', 'controlEvent'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
  },
  imports: [NgTemplateOutlet, LoozoFieldLabel],
  template: `
    <label class="contents" loozoFieldLabel>
      <ng-content select="app-field-label" />
    </label>

    <ng-content />

    @if (api.touched() && api.validationMessages().length) {
      <ng-container [ngTemplateOutlet]="api.validationMessages()[0]" />
    }
  `,
})
export class Field<T> {
  /** @internal */
  class = input<ClassValue>();

  api = inject<LoozoField<T>>(LoozoField);

  protected computedClass = computed(() =>
    mergeClasses('block relative group/field pb-6', this.class()),
  );
}
