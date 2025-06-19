import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  input,
  model,
} from '@angular/core';
import {
  RadianDirection,
  Direction,
  RadianOrientation,
} from '@loozo/radian/common';
import {
  provideRadianRovingFocusGroupContext,
  RadianRovingFocusGroup,
} from '@loozo/radian/roving-focus';
import { RadianAccordionContext } from './accordion-context';

@Directive({
  selector: '[radianAccordion]',
  exportAs: 'radianAccordion',
  providers: [
    {
      provide: RadianAccordionContext,
      useFactory: RadianAccordion.contextFactory,
    },
    provideRadianRovingFocusGroupContext(() => {
      const accordion = inject(RadianAccordion);
      const direction = inject(RadianDirection);

      return () => ({
        dir: direction.value,
        orientation: accordion.orientation,
        loop: computed(() => true),
      });
    }),
  ],
  hostDirectives: [
    RadianRovingFocusGroup,
    { directive: RadianDirection, inputs: ['radianDirection:dir'] },
  ],
})
export class RadianAccordion {
  /**
   * The orientation of the group.
   * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
   */
  orientation = input<RadianOrientation>(RadianOrientation.Vertical);
  /**
   * The direction of navigation between items.
   */
  dir = input<Direction>();
  /**
   * The id of the accordion item(s) whose content is expanded.
   * Emits when the state of the accordion changes.
   */
  value = model<string | string[]>();
  /**
   * Allow multiple items to be expanded at the same time.
   * @default false
   * */
  multiple = input(false, { transform: booleanAttribute });
  /**
   * Whether an accordion item can be collapsed after it has been opened.
   * @default boolean `true` if `multiple` is also `true`. `false` otherwise.
   */
  collapsible = input(undefined, { transform: booleanAttribute });

  private static contextFactory(): RadianAccordionContext {
    const accordion = inject(RadianAccordion);

    const computedCollapsible = computed(() => {
      const collapsible = accordion.collapsible();

      if (collapsible == undefined) {
        return accordion.multiple();
      }

      return collapsible;
    });

    return {
      orientation: accordion.orientation,
      collapsible: computedCollapsible,
      itemOpened(id: string) {
        if (accordion.multiple()) {
          accordion.value.update((v) => {
            if (Array.isArray(v)) {
              return [...v, id];
            }

            return [id];
          });
        } else {
          accordion.value.set(id);
        }
      },
      itemClosed(id: string) {
        if (!computedCollapsible()) {
          return;
        }

        if (accordion.multiple()) {
          accordion.value.update((v) => {
            if (Array.isArray(v)) {
              return v.filter((i) => i !== id);
            }

            return [];
          });
        }
      },
      isItemOpen(id: string) {
        if (accordion.multiple()) {
          return !!accordion.value()?.includes(id);
        }

        return accordion.value() === id;
      },
    };
  }
}
