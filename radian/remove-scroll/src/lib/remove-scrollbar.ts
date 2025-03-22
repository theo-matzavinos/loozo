import {
  afterNextRender,
  DestroyRef,
  Directive,
  inject,
  InjectionToken,
  Provider,
} from '@angular/core';
import { RadianRemoveScrollGapMode } from './types';
import {
  fullWidthClassName,
  noScrollbarsClassName,
  removedBarSizeVariable,
  zeroRightClassName,
} from './constants';

export type RadianRemoveScrollbarOptions = {
  /** Don't change `body`'s `position` to `relative`. */
  noRelative?: boolean;
  /** Don't use `!important`. */
  noImportant?: boolean;
  /**
   * controls the way "gap" is filled
   * @default "margin"
   */
  gapMode?: RadianRemoveScrollGapMode;
};

export const RadianRemoveScrollbarOptions =
  new InjectionToken<RadianRemoveScrollbarOptions>(
    '[Radian] Remove Scrollbar Options',
    {
      factory() {
        return {
          gapMode: 'margin',
        };
      },
    },
  );

export function provideRadianRemoveScrollbarOptions(
  options: RadianRemoveScrollbarOptions,
): Provider {
  return { provide: RadianRemoveScrollbarOptions, useValue: options };
}

const styleElementId = 'radian-remove-scrollbar-styles';

const lockAttribute = 'data-radian-scroll-locked';

@Directive({
  selector: '[radianRemoveScrollbar]',
})
export class RadianRemoveScrollbar {
  constructor() {
    const options = inject(RadianRemoveScrollbarOptions);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (!document.getElementById(styleElementId)) {
        this.setupStyles(options);
      }

      document.body.setAttribute(
        lockAttribute,
        (this.getCurrentCount() + 1).toString(),
      );
      destroyRef.onDestroy(() => {
        const newCounter = this.getCurrentCount() - 1;

        if (newCounter <= 0) {
          document.body.removeAttribute(lockAttribute);
        } else {
          document.body.setAttribute(lockAttribute, newCounter.toString());
        }
      });
    });
  }

  private getCurrentCount() {
    const counter = parseInt(
      document.body.getAttribute(lockAttribute) || '0',
      10,
    );

    return isFinite(counter) ? counter : 0;
  }

  private setupStyles(options: RadianRemoveScrollbarOptions) {
    const computedStyle = getComputedStyle(document.body);

    const left =
      computedStyle[
        options.gapMode === 'padding' ? 'paddingLeft' : 'marginLeft'
      ];
    const top =
      computedStyle[options.gapMode === 'padding' ? 'paddingTop' : 'marginTop'];
    const right =
      computedStyle[
        options.gapMode === 'padding' ? 'paddingRight' : 'marginRight'
      ];

    const offsets = [
      parseInt(left || '', 10) || 0,
      parseInt(top || '', 10) || 0,
      parseInt(right || '', 10) || 0,
    ];
    const documentWidth = document.documentElement.clientWidth;
    const windowWidth = window.innerWidth;
    const gap = {
      left: offsets[0],
      top: offsets[1],
      right: offsets[2],
      gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0]),
    };

    const styles = `
      .${noScrollbarsClassName} {
        overflow: hidden ${!options.noImportant};
        padding-right: ${gap}px ${!options.noImportant};
      }
      body[${lockAttribute}] {
        overflow: hidden ${!options.noImportant};
        overscroll-behavior: contain;
        ${[
          !options.noRelative && `position: relative ${!options.noImportant};`,
          options.gapMode === 'margin' &&
            `
            padding-left: ${left}px;
            padding-top: ${top}px;
            padding-right: ${right}px;
            margin-left:0;
            margin-top:0;
            margin-right: ${gap}px ${!options.noImportant};
          `,
          options.gapMode === 'padding' &&
            `padding-right: ${gap}px ${!options.noImportant};`,
        ]
          .filter(Boolean)
          .join('')}
      }

      .${zeroRightClassName} {
        right: ${gap}px ${!options.noImportant};
      }

      .${fullWidthClassName} {
        margin-right: ${gap}px ${!options.noImportant};
      }

      .${zeroRightClassName} .${zeroRightClassName} {
        right: 0 ${!options.noImportant};
      }

      .${fullWidthClassName} .${fullWidthClassName} {
        margin-right: 0 ${!options.noImportant};
      }

      body[${lockAttribute}] {
        ${removedBarSizeVariable}: ${gap}px;
      }
      `;
    const styleElement = document.createElement('style');

    styleElement.id = styleElementId;
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }
}
