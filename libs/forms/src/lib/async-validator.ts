import {
  Directive,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  signal,
  untracked,
} from '@angular/core';
import { AbstractControl, AsyncValidatorFn } from '@angular/forms';
import { MaybeSignal, unwrapMaybeSignal } from './utils';
import { EMPTY } from 'rxjs';

const NullAsyncValidator = () => EMPTY;

@Directive({
  selector: '[loozoAsyncValidator]',
  standalone: true,
})
export class LoozoAsyncValidator {
  validatorInput = input<AsyncValidatorFn>(NullAsyncValidator, {
    alias: 'loozoAsyncValidator',
  });
  keyInput = input<string>('', { alias: 'loozoAsyncValidatorKey' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageInput = input<TemplateRef<void>>(undefined as any, {
    alias: 'loozoAsyncValidatorMessage',
  });

  private template = inject(TemplateRef, { optional: true });
  private settableKey = signal<string | undefined>(undefined);
  private settableValidator = signal<MaybeSignal<AsyncValidatorFn> | undefined>(
    undefined,
  );
  private settableMessage = signal<MaybeSignal<TemplateRef<void>> | undefined>(
    undefined,
  );

  key = computed(() => {
    const key = this.settableKey() ?? this.keyInput();

    if (isDevMode()) {
      console.assert(!!key, 'No key provided.');
    }

    return key;
  });
  validator = computed(() => {
    const validator =
      unwrapMaybeSignal(this.settableValidator()) ?? this.validatorInput();

    if (isDevMode()) {
      console.assert(
        validator !== NullAsyncValidator,
        'No validator provided.',
      );
    }

    return validator;
  });
  message = computed(() => {
    const message =
      unwrapMaybeSignal(this.settableMessage()) ??
      this.template ??
      this.messageInput();

    if (isDevMode()) {
      console.assert(!!message, 'No message provided.');
    }

    return message;
  });

  constructor() {
    const abstractControl = inject(AbstractControl);

    effect((onCleanup) => {
      const validator = this.validator();

      untracked(() => {
        abstractControl.addAsyncValidators(validator);
        abstractControl.updateValueAndValidity();
      });

      onCleanup(() => {
        abstractControl.removeAsyncValidators(validator);
        abstractControl.updateValueAndValidity();
      });
    });
  }

  setKey(key: string) {
    this.settableKey.set(key);

    return this;
  }

  setValidatorFn(validatorFn: MaybeSignal<AsyncValidatorFn>) {
    this.settableValidator.set(validatorFn);

    return this;
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.settableMessage.set(message);

    return this;
  }
}
