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
import { AbstractControl, ValidatorFn, Validators } from '@angular/forms';
import { MaybeSignal, unwrapMaybeSignal } from './utils';

@Directive({
  selector: '[loozoValidator]',
  standalone: true,
  exportAs: 'loozoValidator',
})
export class LoozoValidator {
  validatorInput = input<ValidatorFn>(Validators.nullValidator, {
    alias: 'loozoValidator',
  });
  keyInput = input<string>('', { alias: 'loozoValidatorKey' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageInput = input<TemplateRef<void>>(undefined as any, {
    alias: 'loozoValidatorMessage',
  });

  private template = inject(TemplateRef, { optional: true });
  private settableKey = signal<string | undefined>(undefined);
  private settableValidator = signal<MaybeSignal<ValidatorFn> | undefined>(
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
        validator !== Validators.nullValidator,
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
        abstractControl.addValidators(validator);
        abstractControl.updateValueAndValidity();
      });

      onCleanup(() => {
        abstractControl.removeValidators(validator);
        abstractControl.updateValueAndValidity();
      });
    });
  }

  setKey(key: string) {
    this.settableKey.set(key);

    return this;
  }

  setValidator(validatorFn: MaybeSignal<ValidatorFn>) {
    this.settableValidator.set(validatorFn);

    return this;
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.settableMessage.set(message);
  }
}
