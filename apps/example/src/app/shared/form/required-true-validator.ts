import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { Validators } from '@angular/forms';
import { ValidationMessage } from './validation-message';
import { ClassValue } from 'clsx';
import { LoozoValidator } from '@loozo/forms';

/** Component that registers a required-true validator. */
@Component({
  selector: 'app-required-true-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: RequiredTrueValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content> This field must be checked. </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class RequiredTrueValidator implements LoozoValidator {
  /** @internal */
  key = computed(() => 'required');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.requiredTrue);
  /** @internal */
  class = input<ClassValue>();
}
