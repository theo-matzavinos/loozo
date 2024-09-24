import { toSignal } from '@angular/core/rxjs-interop';

import type { FormControl } from '@angular/forms';

export function controlValue<U>(
  formControl: Pick<FormControl<U>, 'value' | 'valueChanges'>,
) {
  return toSignal(formControl.valueChanges, {
    initialValue: formControl.value,
  });
}
