import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RadianRadio } from './radio';
import {
  RadianArrowKeys,
  RadianControlValueAccessor,
} from '@loozo/radian/common';
import { RadianRadioGroupTrigger } from './radio-group-trigger';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianRadioGroupItemContext } from './radio-group-item-context';
import {
  provideRadianFocusableContext,
  RadianFocusable,
} from '@loozo/radian/roving-focus';

@Directive({
  selector: '[radianRadioGroupItem]',
  exportAs: 'radianRadioGroupItem',
  providers: [
    {
      provide: RadianRadioGroupItemContext,
      useFactory: RadianRadioGroupItem.contextFactory,
    },
    provideRadianFocusableContext(() => ({
      value: inject(RadianRadioGroupItem).value,
    })),
  ],
  hostDirectives: [
    {
      directive: RadianRadio,
      inputs: ['disabled', 'required', 'value', 'form'],
    },
    RadianFocusable,
  ],
  host: {
    '(document:keydown)': 'documentKeyDown($event)',
    '(document:keyup)': 'isArrowKeyPressed.set(false)',
    // According to WAI ARIA, radio groups don't activate items on enter keypress
    '(keydown.enter)': '$event.preventDefault()',
    /**
     * Our `RovingFocusGroup` will focus the radio when navigating with arrow keys
     * and we need to "check" it in that case. We click it to "check" it (instead
     * of using `controlValueAccessor.setValue`) so that the radio change event fires.
     */
    '(focus)': 'isArrowKeyPressed() && triggerElement.nativeElement.click()',
  },
})
export class RadianRadioGroupItem {
  /** Whether this control is disabled. */
  disabled = input(false, {
    transform: booleanAttribute,
  });
  /** Whether the radio is required. For a11y purposes - does not perform validation. */
  required = input(false, { transform: booleanAttribute });
  /**
   * A string representing the value of the radio.
   */
  value = input.required<string>();
  /**
   * Associates the control with a form element.
   */
  form = input<string>();

  protected isArrowKeyPressed = signal(false);
  protected triggerElement = contentChild.required<
    RadianRadioGroupTrigger,
    ElementRef<HTMLButtonElement>
  >(RadianRadioGroupTrigger, { read: ElementRef });
  private radioGroupControlValueAccessor = inject(RadianControlValueAccessor, {
    skipSelf: true,
  });
  private radioControlValueAccessor = inject(RadianControlValueAccessor, {
    self: true,
  });

  /** Emits when the radio is toggled. */
  checkedChange = outputFromObservable(
    outputToObservable(this.radioControlValueAccessor.valueChange),
  );

  /** Whether this control is disabled. */
  computedDisabled = computed(
    () => this.radioGroupControlValueAccessor.disabled() || this.disabled(),
  );

  constructor() {
    effect(() => {
      const checked =
        this.radioGroupControlValueAccessor.value() === this.value();

      untracked(() => this.radioControlValueAccessor.setValue(checked));
    });

    effect(() => {
      if (this.radioControlValueAccessor.value()) {
        untracked(() =>
          this.radioGroupControlValueAccessor.setValue(this.value()),
        );
      }
    });
  }

  protected documentKeyDown(event: KeyboardEvent) {
    if (!RadianArrowKeys.includes(event.key)) {
      return;
    }

    this.isArrowKeyPressed.set(true);
  }

  private static contextFactory(): RadianRadioGroupItemContext {
    const radioGroupItem = inject(RadianRadioGroupItem);

    return {
      disabled: radioGroupItem.computedDisabled,
      value: radioGroupItem.value,
    };
  }
}
