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
  RadianSelectMultipleContext,
  RadianSelectOption,
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
import { RadianSelectMultipleValue } from './select-multiple-value';

@Directive({
  selector: '[radianSelectMultiple]',
  providers: [
    {
      provide: RadianSelectContext,
      useFactory: RadianSelectMultiple.contextFactory,
    },
    provideRadianTypeahead(),
  ],
  hostDirectives: [
    { directive: RadianControlValueAccessor, inputs: ['value', 'disabled'] },
  ],
})
export class RadianSelectMultiple {
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
  private controlValueAccessor: RadianControlValueAccessor<
    string[] | undefined
  > = inject(RadianControlValueAccessor);
  private isOpen = linkedSignal(this.open);

  valueChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );
  private trigger = contentChild.required(RadianSelectTrigger, {
    read: ElementRef,
  });
  private valueNode = contentChild.required(RadianSelectMultipleValue, {
    read: ElementRef,
  });

  private static contextFactory(): RadianSelectMultipleContext {
    const select = inject(RadianSelectMultiple);
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
        const currentValue = select.controlValueAccessor.value();

        if (value === currentValue) {
          return;
        }

        if (value === undefined || currentValue === undefined) {
          select.controlValueAccessor.setValue(value);

          return;
        }

        if (
          value.length === currentValue.length &&
          value.every((i) => currentValue.includes(i))
        ) {
          return;
        }

        select.controlValueAccessor.setValue(value);
      },
      toggle(value) {
        const currentValue = select.controlValueAccessor.value() ?? [];

        if (currentValue.includes(value)) {
          select.controlValueAccessor.setValue(
            currentValue.filter((i) => i !== value),
          );
        } else {
          select.controlValueAccessor.setValue([...currentValue, value]);
        }
      },
      trigger: select.trigger,
      triggerPointerDownPos: signal(undefined),
      value: select.controlValueAccessor.value,
      multiple: true,
      options: options.asReadonly(),
      valueNode: select.valueNode,
      add(value) {
        if (select.controlValueAccessor.value()?.includes(value)) {
          return;
        }

        select.controlValueAccessor.setValue([
          ...(select.controlValueAccessor.value() ?? []),
          value,
        ]);
      },
      remove(value) {
        if (!select.controlValueAccessor.value()?.includes(value)) {
          return;
        }

        select.controlValueAccessor.setValue(
          select.controlValueAccessor.value()?.filter((i) => i !== value),
        );
      },
      addOption(option) {
        options.update((v) => [...v, option]);
      },
      removeOption(option) {
        options.update((v) => v.filter((i) => i !== option));
      },
    };
  }
}
