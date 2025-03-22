import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  model,
  untracked,
} from '@angular/core';
import { RadianCollapsibleContent } from './collapsible-content';

export type RadianCollapsibleContext = ReturnType<
  (typeof RadianCollapsible)['contextFactory']
>;

export const RadianCollapsibleContext =
  new InjectionToken<RadianCollapsibleContext>('[Radian] Collapsible Context');

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
  protected content = contentChild.required(RadianCollapsibleContent);

  /** The state of this collapsible. */
  state = computed(() => (this.open() ? 'open' : 'closed'));

  /** Toggles this collapsible */
  toggle() {
    untracked(() => this.open.update((v) => !v));
  }

  private _computedDisabled = linkedSignal(this.disabled);

  /** Whether the collapsible is disabled. */
  computedDisabled = this._computedDisabled.asReadonly();

  protected enable() {
    this._computedDisabled.set(false);
  }

  protected disable() {
    this._computedDisabled.set(true);
  }

  private static contextFactory() {
    const collapsible = inject(RadianCollapsible);

    return {
      open: collapsible.open,
      disabled: collapsible.computedDisabled,
      content: collapsible.content,
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
