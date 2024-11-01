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

/** Registers an email validator. */
@Component({
  selector: 'app-email-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: LoozoValidator, useExisting: EmailValidator }],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content>Provide a valid email address.</ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class EmailValidator implements LoozoValidator {
  /** @internal */
  key = computed(() => 'email');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.email);
  /** @internal */
  class = input<ClassValue>();
}
