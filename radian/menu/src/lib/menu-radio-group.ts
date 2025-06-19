import { Directive, inject, input, linkedSignal, output } from '@angular/core';
import { RadianMenuGroup } from './menu-group';
import { RadianMenuRadioGroupContext } from './menu-radio-group-context';

@Directive({
  selector: '[radianMenuRadioGroup]',
  providers: [
    {
      provide: RadianMenuRadioGroupContext,
      useFactory: RadianMenuRadioGroup.contextFactory,
    },
  ],
  hostDirectives: [RadianMenuGroup],
})
export class RadianMenuRadioGroup {
  value = input<string | undefined>();

  valueChange = output<string>();

  private currentValue = linkedSignal(this.value);

  private static contextFactory(): RadianMenuRadioGroupContext {
    const menuRadioGroup = inject(RadianMenuRadioGroup);

    return {
      value: menuRadioGroup.currentValue.asReadonly(),
      setValue(value: string) {
        menuRadioGroup.currentValue.set(value);
        menuRadioGroup.valueChange.emit(value);
      },
    };
  }
}
