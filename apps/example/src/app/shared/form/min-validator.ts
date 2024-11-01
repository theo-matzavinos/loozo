import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  input,
  numberAttribute,
  viewChild,
} from '@angular/core';
import { Validators } from '@angular/forms';
import { ValidationMessage } from './validation-message';
import { ClassValue } from 'clsx';
import { LoozoValidator } from '@loozo/forms';

/** Component that registers a min value validator. */
@Component({
  selector: 'app-min-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: MinValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content>
          The minimum value of this field is {{ value() }}.
        </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class MinValidator implements LoozoValidator {
  /** The min allowed value. */
  value = input.required({ transform: numberAttribute });
  /** @internal */
  key = computed(() => 'min');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.min(this.value()));
  /** @internal */
  class = input<ClassValue>();
}
