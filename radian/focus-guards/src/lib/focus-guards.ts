import { afterNextRender, DestroyRef, Directive, inject } from '@angular/core';

let count = 0;

const focusGuardDataAttribute = 'data-radian-focus-guard';
const radianFocusGuardSelector = `[${focusGuardDataAttribute}]`;

/**
 * Injects a pair of focus guards at the edges of the whole DOM tree
 * to ensure `focusin` & `focusout` events can be caught consistently.
 */
@Directive()
export class RadianFocusGuards {
  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const guards = document.querySelectorAll(radianFocusGuardSelector);

      document.body.insertAdjacentElement(
        'afterbegin',
        guards[0] ?? createFocusGuard(),
      );
      document.body.insertAdjacentElement(
        'beforeend',
        guards[1] ?? createFocusGuard(),
      );
      count++;

      destroyRef.onDestroy(() => {
        count--;

        if (!count) {
          document
            .querySelectorAll(radianFocusGuardSelector)
            .forEach((node) => node.remove());
        }
      });
    });
  }
}

function createFocusGuard() {
  const element = document.createElement('span');

  element.setAttribute(focusGuardDataAttribute, '');
  element.tabIndex = 0;
  element.style.outline = 'none';
  element.style.opacity = '0';
  element.style.position = 'fixed';
  element.style.pointerEvents = 'none';

  return element;
}
