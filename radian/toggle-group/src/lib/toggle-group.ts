import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  InjectionToken,
  input,
  model,
} from '@angular/core';
import {
  RadianControlValueAccessor,
  RadianDirection,
  RadianDirectionality,
  RadianOrientation,
} from '@loozo/radian/common';
import {
  provideRadianRovingFocusGroupContext,
  RadianRovingFocusGroup,
} from '@loozo/radian/roving-focus';

export type RadianToggleGroupContext = ReturnType<
  (typeof RadianToggleGroup)['contextFactory']
>;

export const RadianToggleGroupContext =
  new InjectionToken<RadianToggleGroupContext>('[Radian] Toggle Group Context');

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

      return {
        dir: direction.value,
        orientation: toggleGroup.orientation,
        loop: toggleGroup.loop,
        disabled: computed(
          () => toggleGroup.disabled() || toggleGroup.rovingFocusDisabled(),
        ),
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
      outputs: ['valueChange'],
    },
  ],
  host: {
    role: 'group',
    'data-radian-toggle-group': '',
  },
})
export class RadianToggleGroup {
  /** Determines whether a single or multiple items can be pressed at a time. */
  multiple = input(false, { transform: booleanAttribute });
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input.required<RadianOrientation>();
  /** The direction of navigation between items. */
  dir = input<RadianDirectionality>();
  /** Whether keyboard navigation should loop around. */
  loop = input(true, { transform: booleanAttribute });
  /** When `true`, prevents the user from interacting with the toggle group and all its items. */
  disabled = input(false, { transform: booleanAttribute });
  /** When `true`, navigating through the items using arrow keys will be disabled. */
  rovingFocusDisabled = input(false, { transform: booleanAttribute });
  /** Current value of this group. Emits when items are toggled. */
  value = model<string | string[]>();

  private static contextFactory() {
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
