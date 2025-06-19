import {
  afterEveryRender,
  contentChild,
  Directive,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { RadianSelectViewportContext } from './select-viewport-context';
import { RadianSelectContext } from './select-context';
import { RadianSelectItemAlignedContent } from './select-item-aligned-content';
import {
  CONTENT_MARGIN,
  RadianSelectContentContext,
} from './select-content-context';
import { clampNumber } from '../../../common/src';

@Directive({
  selector: '[radianSelectItemAlignedPosition]',
  host: {
    '[style]': `{
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      zIndex: contentZIndex(),
    }`,
  },
})
export class RadianSelectItemAlignedPosition {
  placed = output<void>();

  private context = inject(RadianSelectContext);
  private content = contentChild.required<
    RadianSelectItemAlignedContent,
    ElementRef<HTMLElement>
  >(RadianSelectItemAlignedContent, { read: ElementRef });
  private contentContext = inject(RadianSelectContentContext);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private shouldExpandOnScroll = signal(false);
  private shouldReposition = signal(true);
  protected contentZIndex = signal('0');

  constructor() {
    afterEveryRender(() => {
      this.position();
      this.contentZIndex.set(
        window.getComputedStyle(this.content().nativeElement).zIndex,
      );
    });
  }

  private position() {
    const selectedItem = this.contentContext.selectedItem()?.nativeElement;
    const selectedItemText =
      this.contentContext.selectedItemText()?.nativeElement;

    if (!(selectedItem && selectedItemText)) {
      return;
    }

    const triggerRect = this.context
      .trigger()
      .nativeElement.getBoundingClientRect();

    const content = this.content().nativeElement;
    // -----------------------------------------------------------------------------------------
    //  Horizontal positioning
    // -----------------------------------------------------------------------------------------
    const contentRect = content.getBoundingClientRect();
    const valueNode = this.context.valueNode().nativeElement;
    const valueNodeRect = valueNode.getBoundingClientRect();
    const itemTextRect = selectedItem.getBoundingClientRect();
    const contentWrapper = this.elementRef.nativeElement;

    if (this.context.dir() !== 'rtl') {
      const itemTextOffset = itemTextRect.left - contentRect.left;
      const left = valueNodeRect.left - itemTextOffset;
      const leftDelta = triggerRect.left - left;
      const minContentWidth = triggerRect.width + leftDelta;
      const contentWidth = Math.max(minContentWidth, contentRect.width);
      const rightEdge = window.innerWidth - CONTENT_MARGIN;
      const clampedLeft = clampNumber(left, [
        CONTENT_MARGIN,
        // Prevents the content from going off the starting edge of the
        // viewport. It may still go off the ending edge, but this can be
        // controlled by the user since they may want to manage overflow in a
        // specific way.
        // https://github.com/radix-ui/primitives/issues/2049
        Math.max(CONTENT_MARGIN, rightEdge - contentWidth),
      ]);

      contentWrapper.style.minWidth = minContentWidth + 'px';
      contentWrapper.style.left = clampedLeft + 'px';
    } else {
      const itemTextOffset = contentRect.right - itemTextRect.right;
      const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
      const rightDelta = window.innerWidth - triggerRect.right - right;
      const minContentWidth = triggerRect.width + rightDelta;
      const contentWidth = Math.max(minContentWidth, contentRect.width);
      const leftEdge = window.innerWidth - CONTENT_MARGIN;
      const clampedRight = clampNumber(right, [
        CONTENT_MARGIN,
        Math.max(CONTENT_MARGIN, leftEdge - contentWidth),
      ]);

      contentWrapper.style.minWidth = minContentWidth + 'px';
      contentWrapper.style.right = clampedRight + 'px';
    }

    // -----------------------------------------------------------------------------------------
    // Vertical positioning
    // -----------------------------------------------------------------------------------------
    const items = this.context.options();
    const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
    const viewport = this.contentContext.viewport().nativeElement;
    const itemsHeight = viewport.scrollHeight;

    const contentStyles = window.getComputedStyle(content);
    const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
    const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
    const contentBorderBottomWidth = parseInt(
      contentStyles.borderBottomWidth,
      10,
    );
    const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
    const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth; // prettier-ignore
    const minContentHeight = Math.min(
      selectedItem.offsetHeight * 5,
      fullContentHeight,
    );

    const viewportStyles = window.getComputedStyle(viewport);
    const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
    const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);

    const topEdgeToTriggerMiddle =
      triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
    const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;

    const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
    const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
    const contentTopToItemMiddle =
      contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
    const itemMiddleToContentBottom =
      fullContentHeight - contentTopToItemMiddle;

    const willAlignWithoutTopOverflow =
      contentTopToItemMiddle <= topEdgeToTriggerMiddle;

    if (willAlignWithoutTopOverflow) {
      const isLastItem =
        items.length > 0 &&
        selectedItem === items[items.length - 1].elementRef.nativeElement;
      contentWrapper.style.bottom = 0 + 'px';
      const viewportOffsetBottom =
        content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
      const clampedTriggerMiddleToBottomEdge = Math.max(
        triggerMiddleToBottomEdge,
        selectedItemHalfHeight +
          // viewport might have padding bottom, include it to avoid a scrollable viewport
          (isLastItem ? viewportPaddingBottom : 0) +
          viewportOffsetBottom +
          contentBorderBottomWidth,
      );
      const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
      contentWrapper.style.height = height + 'px';
    } else {
      const isFirstItem =
        items.length > 0 && selectedItem === items[0].elementRef.nativeElement;
      contentWrapper.style.top = 0 + 'px';
      const clampedTopEdgeToTriggerMiddle = Math.max(
        topEdgeToTriggerMiddle,
        contentBorderTopWidth +
          viewport.offsetTop +
          // viewport might have padding top, include it to avoid a scrollable viewport
          (isFirstItem ? viewportPaddingTop : 0) +
          selectedItemHalfHeight,
      );
      const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
      contentWrapper.style.height = height + 'px';
      viewport.scrollTop =
        contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
    }

    contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
    contentWrapper.style.minHeight = minContentHeight + 'px';
    contentWrapper.style.maxHeight = availableHeight + 'px';
    // -----------------------------------------------------------------------------------------

    this.placed.emit();

    // we don't want the initial scroll position adjustment to trigger "expand on scroll"
    // so we explicitly turn it on only after they've registered.
    requestAnimationFrame(() => this.shouldExpandOnScroll.set(true));
  }

  private static contextFactory(): RadianSelectViewportContext {
    const itemAlignedPosition = inject(RadianSelectItemAlignedPosition);

    return {
      contentWrapper: itemAlignedPosition.elementRef,
      shouldExpandOnScroll:
        itemAlignedPosition.shouldExpandOnScroll.asReadonly(),
      // When the viewport becomes scrollable at the top, the scroll up button will mount.
      // Because it is part of the normal flow, it will push down the viewport, thus throwing our
      // trigger => selectedItem alignment off by the amount the viewport was pushed down.
      // We wait for this to happen and then re-run the positining logic one more time to account for it.
      scrollButtonAdded() {
        if (itemAlignedPosition.shouldReposition() === true) {
          itemAlignedPosition.position();
          itemAlignedPosition.contentContext.focusSelectedItem();
          itemAlignedPosition.shouldReposition.set(false);
        }
      },
    };
  }
}
