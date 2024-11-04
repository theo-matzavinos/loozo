import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { LoozoFieldArray } from '@loozo/forms';
import { ClassValue } from 'clsx';
import { mergeClasses } from '../merge-classes';
import { Button } from '../button';

@Component({
  selector: 'app-field-array',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: LoozoFieldArray,
      inputs: ['loozoFieldArray:name', 'loozoFieldArrayType:itemType'],
      outputs: ['valueChange', 'statusChange', 'controlEvent'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
  },
  imports: [Button],
  template: `
    <fieldset class="contents">
      <legend class="flex gap-2">
        <ng-content select="app-field-label" />
        <button
          class="ml-auto"
          type="button"
          appBtn
          size="sm"
          (click)="api.addItem()"
        >
          Add
        </button>
      </legend>

      <ng-content />
    </fieldset>
  `,
})
export class FieldArray<T> {
  class = input<ClassValue>();

  type = input<T>();

  api = inject<LoozoFieldArray<T>>(LoozoFieldArray);

  protected computedClass = computed(() =>
    mergeClasses('flex flex-col gap-4', this.class()),
  );
}
