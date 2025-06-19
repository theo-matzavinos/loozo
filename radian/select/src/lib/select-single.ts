import {
  booleanAttribute,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  RadianSelectContext,
  RadianSelectOption,
  RadianSelectSingleContext,
} from './select-context';
import {
  RadianControlValueAccessor,
  RadianDirection,
  uniqueId,
} from '@loozo/radian/common';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { provideRadianTypeahead } from './typeahead';
import { RadianSelectTrigger } from './select-trigger';
import { RadianSelectSingleValue } from './select-single-value';

@Directive({
  selector: '[radianSelectSingle]',
  providers: [
    {
      provide: RadianSelectContext,
      useFactory: RadianSelectSingle.contextFactory,
    },
    provideRadianTypeahead(),
  ],
  hostDirectives: [
    { directive: RadianControlValueAccessor, inputs: ['value', 'disabled'] },
  ],
})
export class RadianSelectSingle {
  open = input(false, { transform: booleanAttribute });
  name = input<string>();
  autoComplete = input<string>();
  required = input(false, { transform: booleanAttribute });
  form = input<string>();
  /** Value of this control. */
  value = input<string>();
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  openChange = output<boolean>();
  private controlValueAccessor: RadianControlValueAccessor<string | undefined> =
    inject(RadianControlValueAccessor);
  private isOpen = linkedSignal(this.open);

  valueChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );

  private trigger = contentChild.required(RadianSelectTrigger, {
    read: ElementRef,
  });

  private valueNode = contentChild.required(RadianSelectSingleValue, {
    read: ElementRef,
  });

  private static contextFactory(): RadianSelectSingleContext {
    const select = inject(RadianSelectSingle);
    const direction = inject(RadianDirection);
    const options = signal<RadianSelectOption[]>([]);

    return {
      contentId: uniqueId('radian-select-content'),
      dir: direction.value,
      disabled: select.controlValueAccessor.disabled,
      open: select.isOpen.asReadonly(),
      required: select.required,
      setOpen(open) {
        select.isOpen.set(open);
        select.openChange.emit(open);
      },
      setValue(value) {
        select.controlValueAccessor.setValue(value);
      },
      trigger: select.trigger,
      triggerPointerDownPos: signal(undefined),
      value: select.controlValueAccessor.value,
      multiple: false,
      options: options.asReadonly(),
      addOption(option) {
        options.update((v) => [...v, option]);
      },
      removeOption(option) {
        options.update((v) => v.filter((i) => i !== option));
      },
      valueNode: select.valueNode,
    };
  }
}
