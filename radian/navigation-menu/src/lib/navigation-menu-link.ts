import {
  booleanAttribute,
  computed,
  Directive,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLinkActive } from '@angular/router';
import { RadianFocusGroupItem } from './focus-group-item';
import { outputToObservable, toSignal } from '@angular/core/rxjs-interop';
import { RadianNavigationMenuContext } from './navigation-menu-context';

const LINK_SELECT = 'navigationMenu.linkSelect';

@Directive({
  selector: '[radianNavigationMenuLink]',
  hostDirectives: [RadianFocusGroupItem],
  host: {
    '[attr.data-active]': 'computedActive() || null',
    '[attr.aria-current]': 'computedActive() ? "page" : null',
    '(click)': 'clicked($event)',
  },
})
export class RadianNavigationMenuLink {
  active = input(undefined, { transform: booleanAttribute });

  private routerLinkActive = inject(RouterLinkActive, {
    self: true,
    optional: true,
  });
  private isRouterLinkActive = this.routerLinkActive
    ? toSignal(outputToObservable(this.routerLinkActive.isActiveChange))
    : computed(() => false);

  computedActive = computed(() => {
    if (this.active() == undefined) {
      return this.isRouterLinkActive();
    }

    return this.active();
  });

  selected = output<Event>();

  private context = inject(RadianNavigationMenuContext);

  protected clicked(event: MouseEvent) {
    const linkSelectEvent = new CustomEvent(LINK_SELECT, {
      bubbles: true,
      cancelable: true,
    });

    this.selected.emit(event);

    if (!linkSelectEvent.defaultPrevented && !event.metaKey) {
      this.context.rootContentDismissed.next();
    }
  }
}
