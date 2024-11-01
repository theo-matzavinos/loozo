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

/** Component that registers a min-length validator. */
@Component({
  selector: 'app-min-length-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: MinLengthValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content>
          The minimum length of this field is {{ value() }}.
        </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class MinLengthValidator implements LoozoValidator {
  /** The min-length value. */
  value = input.required({ transform: numberAttribute });
  /** @internal */
  key = computed(() => 'minlength');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.minLength(this.value()));
  /** @internal */
  class = input<ClassValue>();
}
