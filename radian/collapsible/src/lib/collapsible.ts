import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  input,
  linkedSignal,
  model,
  untracked,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianCollapsibleContext } from './collapsible-context';

@Directive({
  selector: '[radianCollapsible]',
  exportAs: 'radianCollapsible',
  providers: [
    {
      provide: RadianCollapsibleContext,
      useFactory: RadianCollapsible.contextFactory,
    },
  ],
  host: {
    '[attr.data-state]': 'state()',
    '[attr.data-disabled]': "computedDisabled() ? '' : null",
  },
})
export class RadianCollapsible {
  id = input(uniqueId('radian-collapsible'));
  /**
   * Whether this collapsible is open.
   * Emits when the collapsible is toggled.
   * @default false
   * */
  open = model(false);
  /**
   * Whether this collapsible is disabled.
   * @default false
   * */
  disabled = input(false, { transform: booleanAttribute });

  /** @internal */
  // protected content = contentChild.required(RadianCollapsibleContent);

  /** The state of this collapsible. */
  state = computed(() => (this.open() ? 'open' : 'closed'));

  /** Toggles this collapsible */
  toggle() {
    untracked(() => this.open.update((v) => !v));
  }

  private _computedDisabled = linkedSignal(this.disabled);

  /** Whether the collapsible is disabled. */
  computedDisabled = this._computedDisabled.asReadonly();

  enable() {
    this._computedDisabled.set(false);
  }

  disable() {
    this._computedDisabled.set(true);
  }

  private static contextFactory(): RadianCollapsibleContext {
    const collapsible = inject(RadianCollapsible);

    return {
      open: collapsible.open,
      disabled: collapsible.computedDisabled,
      contentId: computed(() => `${collapsible.id()}-content`),
      state: collapsible.state,
      toggle() {
        collapsible.toggle();
      },
      enable() {
        collapsible.enable();
      },
      disable() {
        collapsible.disable();
      },
    };
  }
}
