import {
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  provideRadianFocusScopeContext,
  RadianFocusScope,
} from '@loozo/radian/focus-scope';
import { RadianSelectContentContext } from './select-content-context';
import { findNextItem, RadianTypeahead } from './typeahead';
import { hideOthers } from 'aria-hidden';
import { RadianSelectContext } from './select-context';
import { RadianSelectViewport } from './select-viewport';

@Directive({
  selector: '[radianSelectContent]',
  providers: [
    {
      provide: RadianSelectContentContext,
      useFactory: RadianSelectContent.contextFactory,
    },
    provideRadianFocusScopeContext(() => {
      const context = inject(RadianSelectContext);

      return {
        loop: computed(() => false),
        trapped: context.open,
      };
    }),
  ],
  hostDirectives: [RadianFocusScope],
  host: {
    role: 'listbox',
    '[id]': 'context.contentId',
    '[attr.data-state]': "context.open() ? 'open' : 'closed'",
    '[dir]': 'context.dir()',
    '[style]': `{
      display: 'flex',
      flexDirection: 'column',
      outline: 'none',
    }`,
    '(contextmenu)': '$event.preventDefault()',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianSelectContent {
  openAutoFocus = output<Event>();
  closeAutoFocus = output<Event>();

  protected context = inject(RadianSelectContext);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private typeahead = inject(RadianTypeahead);

  private selectedItems = computed(() => {
    const value = this.context.value();

    if (!value) {
      return [];
    }

    if (this.context.multiple) {
      return this.context
        .options()
        .filter((o) => (value as string[]).includes(o.value()));
    }

    return [
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.context
        .options()
        .find(
          (o) => (this.context.value() as string | undefined) === o.value(),
        )!,
    ];
  });
  private lastSelectedItem = computed(() => {
    if (this.selectedItems().length) {
      return this.selectedItems()[this.selectedItems().length - 1];
    }

    return this.context.options().find((o) => !o.disabled());
  });
  private viewport = contentChild.required(RadianSelectViewport, {
    read: ElementRef,
  });

  constructor() {
    const focusScope = inject(RadianFocusScope);

    focusScope.mountAutoFocus.subscribe((e) => {
      // we prevent open autofocus because we manually focus the selected item
      e.preventDefault();
    });

    focusScope.unmountAutoFocus.subscribe((event) => {
      this.closeAutoFocus.emit(event);

      if (event.defaultPrevented) {
        return;
      }

      this.context.trigger().nativeElement.focus({ preventScroll: true });
      event.preventDefault();
    });

    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    effect((onCleanup) => {
      if (!this.context.open()) {
        return;
      }

      // aria-hide everything except the content (better supported equivalent to setting aria-modal)
      const undoHideOthers = hideOthers(elementRef.nativeElement);

      onCleanup(() => {
        undoHideOthers();
      });
    });

    effect(() => {
      const search = this.typeahead.value();

      const enabledItems = this.context
        .options()
        .filter((item) => !item.disabled());
      const currentItem = enabledItems.find(
        (item) => item.elementRef.nativeElement === document.activeElement,
      );
      const nextItem = findNextItem(enabledItems, search, currentItem);
      if (nextItem) {
        /**
         * Imperative focus during keydown is risky
         */
        setTimeout(() => nextItem.elementRef.nativeElement.focus());
      }
    });
  }

  protected keyDown(event: KeyboardEvent) {
    const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;

    // select should not be navigated using tab key so we prevent it
    if (event.key === 'Tab') {
      event.preventDefault();
    }

    if (!isModifierKey && event.key.length === 1) {
      this.typeahead.search(event.key);
    }

    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      const items = this.context.options().filter((item) => !item.disabled());
      let candidateNodes = items.map((item) => item.elementRef.nativeElement);

      if (['ArrowUp', 'End'].includes(event.key)) {
        candidateNodes = candidateNodes.slice().reverse();
      }
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
        const currentElement = event.target as HTMLElement;
        const currentIndex = candidateNodes.indexOf(currentElement);

        candidateNodes = candidateNodes.slice(currentIndex + 1);
      }

      /**
       * Imperative focus during keydown is risky.
       */
      setTimeout(() => this.focusFirst(candidateNodes));

      event.preventDefault();
    }
  }

  private focusFirst(candidates: Array<HTMLElement | undefined>) {
    const [firstItem, ...restItems] = this.context
      .options()
      .map((item) => item.elementRef.nativeElement);
    const [lastItem] = restItems.slice(-1);

    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;

    for (const candidate of candidates) {
      // if focus is already where we want to go, we don't want to keep going through the candidates
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) {
        return;
      }

      candidate?.scrollIntoView({ block: 'nearest' });
      // viewport might have padding so scroll to its edges when focusing first/last items.
      if (candidate === firstItem) {
        this.viewport().nativeElement.scrollTop = 0;
      }

      if (candidate === lastItem) {
        this.viewport().nativeElement.scrollTop =
          this.viewport().nativeElement.scrollHeight;
      }

      candidate?.focus();

      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) {
        return;
      }
    }
  }

  private static contextFactory(): RadianSelectContentContext {
    const content = inject(RadianSelectContent);

    return {
      content: content.elementRef,
      focusSelectedItem() {
        content.focusFirst([
          content.lastSelectedItem()?.elementRef?.nativeElement,
          content.elementRef.nativeElement,
        ]);
      },
      isPositioned: signal(false),
      itemUnhovered() {
        content.elementRef.nativeElement.focus();
      },
      viewport: content.viewport,
      search: content.typeahead.value,
      selectedItem: computed(() => content.lastSelectedItem()?.elementRef),
      selectedItemText: computed(() =>
        content.lastSelectedItem()?.textElement(),
      ),
      canScrollDown: signal(false),
      canScrollUp: signal(false),
    };
  }
}
