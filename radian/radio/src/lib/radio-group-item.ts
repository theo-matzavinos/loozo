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

export type RadianCheckedState = boolean | 'indeterminate';

@Directive({
  selector: '[radianRadioGroupItem]',
  exportAs: 'radianRadioGroupItem',
  hostDirectives: [
    {
      directive: RadianRadio,
      inputs: ['disabled', 'required', 'value', 'form'],
      outputs: ['checkedChange'],
    },
  ],
  host: {
    'data-radian-radio-group-item': '',
    '[attr.data-radian-radio]': 'null',
    '[disabled]': 'computedDisabled()',
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
  value = input.required();
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

  /** Whether this control is disabled. */
  computedDisabled = computed(
    () => this.radioGroupControlValueAccessor.disabled() || this.disabled(),
  );

  constructor() {
    const radioControlValueAccessor = inject(RadianControlValueAccessor, {
      self: true,
    });

    effect(() => {
      const checked =
        this.radioGroupControlValueAccessor.value() === this.value();

      untracked(() => radioControlValueAccessor.setValue(checked));
    });

    effect(() => {
      if (radioControlValueAccessor.value()) {
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
}
