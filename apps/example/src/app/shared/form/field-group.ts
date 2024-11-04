import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { LoozoFieldGroup } from '@loozo/forms';
import { ClassValue } from 'clsx';
import { mergeClasses } from '../merge-classes';

@Component({
  selector: 'app-field-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    {
      directive: LoozoFieldGroup,
      inputs: ['loozoFieldGroup:name', 'loozoFieldGroupType:type'],
      outputs: ['valueChange', 'statusChange', 'controlEvent'],
    },
  ],
  host: {
    '[class]': 'computedClass()',
  },
  template: `
    <fieldset class="contents">
      <legend class="contents">
        <ng-content select="app-field-label" />
      </legend>

      <ng-content />
    </fieldset>
  `,
})
export class FieldGroup<T> {
  class = input<ClassValue>();
  type = input<T>();

  api = inject<LoozoFieldGroup<T>>(LoozoFieldGroup);

  protected computedClass = computed(() =>
    mergeClasses('flex flex-col gap-4', this.class()),
  );
}
