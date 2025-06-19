import { Directive, effect, input, isDevMode } from '@angular/core';
import { RadianToastAnnounceExclude } from './toast-announce-exclude';

@Directive({
  selector: '[radianToastAction]',
  hostDirectives: [
    { directive: RadianToastAnnounceExclude, inputs: ['altText'] },
  ],
})
export class RadianToastAction {
  /**
   * A short description for an alternate way to carry out the action. For screen reader users
   * who will not be able to navigate to the button easily/quickly.
   * @example <button radianToastAction altText="Goto account settings to upgrade">Upgrade</button>
   * @example <button radianToastAction altText="Undo (Alt+U)">Undo</button>
   */
  altText = input.required<string>();

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.altText().trim()) {
          console.error(
            `Invalid input value \`altText\` supplied to \`RadianToastAction\`. Expected non-empty \`string\`.`,
          );
        }
      });
    }
  }
}
