import {
  booleanAttribute,
  Directive,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  output,
  signal,
} from '@angular/core';
import { RadianPopper } from '@loozo/radian/popper';
import { RadianHoverCardContext } from './hover-card-context';

@Directive({
  selector: '[radianHoverCard]',
  exportAs: 'radianHoverCard',
  providers: [
    {
      provide: RadianHoverCardContext,
      useFactory: RadianHoverCard.contextFactory,
    },
  ],
  hostDirectives: [RadianPopper],
})
export class RadianHoverCard {
  /** Controls whether the card's content is visible. */
  openInput = input(false, { transform: booleanAttribute, alias: 'open' });
  openDelayMs = input(700, { transform: numberAttribute });
  closeDelayMs = input(300, { transform: numberAttribute });
  /** Emits when the card opens or closes. */
  openChange = output<boolean>();

  private isOpen = linkedSignal(this.openInput);
  private openTimer = signal<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  private closeTimer = signal<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  private hasSelection = signal(false);
  private isPointerDownOnContent = signal(false);

  /** Open the card after `openDelayMs` have passed. */
  open() {
    clearTimeout(this.closeTimer());

    this.openTimer.set(
      setTimeout(() => {
        this.setIsOpen(true);
      }, this.openDelayMs()),
    );
  }

  /** Close the card after `closeDelayMs` have passed. */
  close() {
    clearTimeout(this.openTimer());

    if (!this.hasSelection() && !this.isPointerDownOnContent()) {
      this.closeTimer.set(
        setTimeout(() => this.setIsOpen(false), this.closeDelayMs()),
      );
    }
  }

  /** Open the card immediately. */
  forceOpen() {
    this.setIsOpen(true);
  }

  /** Close the card immediately. */
  dismiss() {
    this.setIsOpen(false);
  }

  private setIsOpen(open: boolean) {
    this.isOpen.set(open);
    this.openChange.emit(open);
  }

  private static contextFactory(): RadianHoverCardContext {
    const hoverCard = inject(RadianHoverCard);

    return {
      isOpen: hoverCard.isOpen.asReadonly(),
      open() {
        hoverCard.open();
      },
      close() {
        hoverCard.close();
      },
      dismiss() {
        hoverCard.dismiss();
      },
      hasSelection: hoverCard.hasSelection,
      isPointerDownOnContent: hoverCard.isPointerDownOnContent,
    };
  }
}
