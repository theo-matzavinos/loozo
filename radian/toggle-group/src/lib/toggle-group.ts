import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  Provider,
} from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import {
  RadianControlValueAccessor,
  RadianDirection,
  Direction,
  RadianOrientation,
  uniqueId,
} from '@loozo/radian/common';
import {
  provideRadianRovingFocusGroupContext,
  RadianRovingFocusGroup,
} from '@loozo/radian/roving-focus';
import { RadianToggleGroupContext } from './toggle-group-context';

export type RadianToggleGroupOptions = {
  ronvigFocusDisabled?: boolean;
};

export const RadianToggleGroupOptions =
  new InjectionToken<RadianToggleGroupOptions>(
    '[Radian] Toggle Group Options',
    {
      factory() {
        return {
          ronvigFocusDisabled: false,
        };
      },
    },
  );

export function provideRadianToggleGroupOptions(
  value: RadianToggleGroupOptions,
): Provider {
  return { provide: RadianToggleGroupOptions, useValue: value };
}

@Directive({
  selector: '[radianToggleGroup]',
  exportAs: 'radianToggleGroup',
  providers: [
    {
      provide: RadianToggleGroupContext,
      useFactory: RadianToggleGroup.contextFactory,
    },
    provideRadianRovingFocusGroupContext(() => {
      const direction = inject(RadianDirection);
      const toggleGroup = inject(RadianToggleGroup);
      const options = inject(RadianToggleGroupOptions);

      return {
        dir: direction.value,
        orientation: toggleGroup.orientation,
        loop: toggleGroup.loop,
        disabled: computed(
          () => toggleGroup.disabled() || !!options.ronvigFocusDisabled,
        ),
        valueFactory() {
          return uniqueId('radian-toggle-group-item');
        },
      };
    }),
  ],
  hostDirectives: [
    RadianRovingFocusGroup,
    {
      directive: RadianDirection,
      inputs: ['radianDirection:dir'],
    },
    {
      directive: RadianControlValueAccessor,
      inputs: ['value', 'disabled'],
    },
  ],
  host: {
    role: 'group',
  },
})
export class RadianToggleGroup {
  /** Determines whether a single or multiple items can be pressed at a time. */
  multiple = input(false, { transform: booleanAttribute });
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input<RadianOrientation>(RadianOrientation.Horizontal);
  /** The direction of navigation between items. */
  dir = input<Direction>();
  /** Whether keyboard navigation should loop around. */
  loop = input(true, { transform: booleanAttribute });
  /** When `true`, prevents the user from interacting with the toggle group and all its items. */
  disabled = input(false, { transform: booleanAttribute });
  /** Current value of this group. */
  value = input<string | string[]>();

  private controlValueAccessor = inject<
    RadianControlValueAccessor<string | string[] | undefined>
  >(RadianControlValueAccessor);

  /** Emits when any of the buttons is toggled. */
  valueChange = outputFromObservable(
    outputToObservable(this.controlValueAccessor.valueChange),
  );

  protected _computedOrientation = linkedSignal(this.orientation);

  /** Actual orientation of this toggle group. */
  computedOrientation = this._computedOrientation.asReadonly();

  /** @internal */
  setOrientation(orientation: RadianOrientation) {
    this._computedOrientation.set(orientation);
  }

  private static contextFactory(): RadianToggleGroupContext {
    const toggleGroup = inject(RadianToggleGroup);
    const controlValueAccessor = inject<
      RadianControlValueAccessor<string | string[] | undefined>
    >(RadianControlValueAccessor);
    const direction = inject(RadianDirection);

    return {
      orientation: toggleGroup.orientation,
      dir: direction.value,
      multiple: toggleGroup.multiple,
      value: controlValueAccessor.value,
      disabled: controlValueAccessor.disabled,
      isItemActive(value: string) {
        if (!this.multiple()) {
          return controlValueAccessor.value() === value;
        }

        const currentValue = controlValueAccessor.value();

        if (Array.isArray(currentValue)) {
          return currentValue.includes(value);
        }

        return false;
      },
      itemActivated(value: string) {
        if (!toggleGroup.multiple()) {
          controlValueAccessor.setValue(value);
        } else {
          const currentValue = controlValueAccessor.value();

          if (Array.isArray(currentValue)) {
            controlValueAccessor.setValue([...currentValue, value]);
          } else {
            controlValueAccessor.setValue([value]);
          }
        }
      },
      itemDeactivated(value: string) {
        if (!toggleGroup.multiple()) {
          controlValueAccessor.setValue(undefined);
        } else {
          const currentValue = controlValueAccessor.value();

          if (Array.isArray(currentValue)) {
            controlValueAccessor.setValue(
              currentValue.filter((i) => i !== value),
            );
          } else {
            controlValueAccessor.setValue([]);
          }
        }
      },
    };
  }
}
