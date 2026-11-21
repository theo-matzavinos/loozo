import { isPlatformBrowser } from "@angular/common";
import {
  ChangeDetectionStrategy,
  PLATFORM_ID,
  Component,
  Directive,
  ViewEncapsulation,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaOptions,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaScrollbarOptions,
  OrigamiScrollAreaState,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";
import type { OrigamiScrollAreaOrientation } from "@loozo/origami-ui/scroll-area";

/**
 * The README recipe, verbatim apart from the `sa` prefix and the fixture sizes: overlay tracks,
 * hidden with `visibility` while not `data-visible`, rounded thumbs with an 18 px minimum on the
 * scrolling axis, the forced-colors and reduced-motion rules. Global (no encapsulation), so every
 * fixture component and composer shares it.
 */
export const scrollAreaRecipe = `
  .sa { position: relative; inline-size: 360px; block-size: 240px; }
  .sa-viewport { block-size: 100%; }
  .sa-viewport:focus-visible { outline: 2px solid #60a5fa; outline-offset: -2px; }

  .sa-bar {
    position: absolute;
    box-sizing: border-box;
    padding: 1px;
    overflow: clip;
    touch-action: none;
    visibility: hidden;
    opacity: 0;
    transition: opacity 150ms, visibility 0s 150ms;
  }
  .sa-bar[data-visible] { visibility: visible; opacity: 1; transition: opacity 150ms; }
  .sa-bar[data-orientation="vertical"] { inset-block: 0; inset-inline-end: 0; inline-size: 10px; }
  .sa-bar[data-orientation="horizontal"] { inset-inline: 0; inset-block-end: 0; block-size: 10px; }
  .sa[data-overflow-y] > .sa-bar[data-orientation="horizontal"] { inset-inline-end: 10px; }
  .sa[data-overflow-x] > .sa-bar[data-orientation="vertical"] { inset-block-end: 10px; }

  .sa-thumb { box-sizing: border-box; border-radius: 9999px; background: #a3a3a3; }
  .sa-bar[data-orientation="vertical"] .sa-thumb { min-block-size: 18px; }
  .sa-bar[data-orientation="horizontal"] .sa-thumb { block-size: 100%; min-inline-size: 18px; }
  .sa.big-min .sa-bar[data-orientation="vertical"] .sa-thumb { min-block-size: 36px; }
  .sa.big-min .sa-bar[data-orientation="horizontal"] .sa-thumb { min-inline-size: 36px; }

  @media (forced-colors: active) {
    .sa-bar { forced-color-adjust: none; background: Canvas; }
    .sa-thumb { forced-color-adjust: none; background: CanvasText; border: 1px solid Canvas; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sa-bar, .sa-bar[data-visible] { transition: none; }
  }

  .sa table { border-collapse: collapse; }
  .sa td { padding: 8px 12px; white-space: nowrap; }
`;

/** A descendant reading its nearest ScrollArea State through DI. */
@Directive({
  selector: "[scrollAreaStateProbe]",
  host: {
    "data-probe": "",
    "[attr.data-overflow-x-state]": "state.overflowX()",
    "[attr.data-overflow-y-state]": "state.overflowY()",
    "[attr.data-active-state]": "state.active()",
  },
})
export class ScrollAreaStateProbe {
  readonly state = inject(OrigamiScrollAreaState);
}

/** A Scrollbar composer exposing `orientation` and owning its Thumb in its own view. */
@Component({
  selector: "scroll-bar",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrigamiScrollAreaThumb],
  hostDirectives: [{ directive: OrigamiScrollAreaScrollbar, inputs: ["orientation"] }],
  host: { class: "sa-bar" },
  template: `<div ogScrollAreaThumb class="sa-thumb"></div>`,
})
export class ScrollBar {}

/**
 * The cashier panel's shape: a consumer component composing the root through `hostDirectives`,
 * exposing `hideDelay`, with its Viewport, Content and a vertical Scrollbar composer in its own
 * OnPush view and a State probe.
 */
@Component({
  selector: "scroll-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrigamiScrollAreaViewport, OrigamiScrollAreaContent, ScrollAreaStateProbe, ScrollBar],
  hostDirectives: [{ directive: OrigamiScrollArea, inputs: ["hideDelay"] }],
  host: { class: "sa sa-panel" },
  template: `
    <div ogScrollAreaViewport class="sa-viewport" [attr.data-testid]="name() + '-viewport'">
      <div ogScrollAreaContent scrollAreaStateProbe [attr.data-testid]="name() + '-content'">
        <ng-content />
      </div>
    </div>
    <scroll-bar orientation="vertical" [attr.data-testid]="name() + '-vbar'" />
  `,
})
export class ScrollPanel {
  readonly name = input.required<string>();
}

/**
 * Both Scrollbars in this component's own template, while the Viewport and Content are in its
 * parent's view: they register when this view runs, after the parent's host bindings have read the
 * registrations, so the parent's overflow and Content sizing refresh in the same pass.
 */
@Component({
  selector: "scroll-rails",
  imports: [OrigamiScrollAreaScrollbar, OrigamiScrollAreaThumb],
  template: `
    <div ogScrollAreaScrollbar orientation="vertical" class="sa-bar" data-testid="railed-vbar">
      <div ogScrollAreaThumb class="sa-thumb" data-testid="railed-vthumb"></div>
    </div>
    <div ogScrollAreaScrollbar orientation="horizontal" class="sa-bar" data-testid="railed-hbar">
      <div ogScrollAreaThumb class="sa-thumb" data-testid="railed-hthumb"></div>
    </div>
  `,
})
export class ScrollRails {}

/** Plain signals a factory root reads; nothing in a template reads them. */
@Directive({ selector: "[scrollAreaSettings]", exportAs: "scrollAreaSettings" })
export class ScrollAreaSettings {
  readonly hideDelay = signal(200);
  readonly orientation = signal<OrigamiScrollAreaOrientation>("horizontal");
}

/** A root with factory Options over a contradicting exposed own input. */
@Directive({
  selector: "[factoryScrollArea]",
  hostDirectives: [{ directive: OrigamiScrollArea, inputs: ["hideDelay: decoyHideDelay"] }],
  providers: [
    OrigamiScrollAreaOptions.provideFactory(() => ({
      hideDelay: inject(ScrollAreaSettings).hideDelay,
    })),
  ],
})
export class FactoryScrollArea {}

/** A Scrollbar with factory Options over a contradicting exposed own input. */
@Directive({
  selector: "[factoryScrollbar]",
  hostDirectives: [
    { directive: OrigamiScrollAreaScrollbar, inputs: ["orientation: decoyOrientation"] },
  ],
  providers: [
    OrigamiScrollAreaScrollbarOptions.provideFactory(() => ({
      orientation: inject(ScrollAreaSettings).orientation,
    })),
  ],
})
export class FactoryScrollbar {}

/** An abstract Options source the existing root and Scrollbar resolve by `provideExisting`. */
export abstract class ScrollAreaSource implements OrigamiScrollAreaOptions {
  abstract readonly hideDelay: OrigamiScrollAreaOptions["hideDelay"];
}

/** A root whose Options are its own record, reached through an abstract class. */
@Directive({
  selector: "[existingScrollArea]",
  hostDirectives: [{ directive: OrigamiScrollArea, inputs: ["hideDelay: decoyHideDelay"] }],
  providers: [
    { provide: ScrollAreaSource, useExisting: forwardRef(() => ExistingScrollArea) },
    OrigamiScrollAreaOptions.provideExisting(() => ScrollAreaSource),
  ],
})
export class ExistingScrollArea implements ScrollAreaSource {
  readonly hideDelay = signal(1000);
}

/** A Scrollbar whose Options are its own record. */
@Directive({
  selector: "[existingScrollbar]",
  hostDirectives: [
    { directive: OrigamiScrollAreaScrollbar, inputs: ["orientation: decoyOrientation"] },
  ],
  providers: [OrigamiScrollAreaScrollbarOptions.provideExisting(() => ExistingScrollbar)],
})
export class ExistingScrollbar implements OrigamiScrollAreaScrollbarOptions {
  readonly orientation = signal<OrigamiScrollAreaOrientation>("vertical");
}

const columns = [0, 1, 2, 3, 4, 5, 6, 7];

function range(count: number): number[] {
  const values: number[] = [];

  for (let index = 0; index < count; index++) {
    values.push(index);
  }

  return values;
}

/**
 * Every ScrollArea case except the split, trigger and appeal layouts. The areas are sized by the
 * recipe (360 × 240) unless a case needs another size; the tests address parts by `data-testid`
 * (`<area>`, `<area>-viewport`, `<area>-content`, `<area>-vbar`, `<area>-vthumb`, `<area>-hbar`,
 * `<area>-hthumb`).
 */
@Component({
  selector: "acceptance-scroll-area-fixture",
  encapsulation: ViewEncapsulation.None,
  host: { "[attr.data-client-rendered]": "clientRendered" },
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
    ScrollAreaStateProbe,
    ScrollPanel,
    ScrollRails,
    ScrollAreaSettings,
    FactoryScrollArea,
    FactoryScrollbar,
    ExistingScrollArea,
    ExistingScrollbar,
  ],
  styles: `
    ${scrollAreaRecipe}

    acceptance-scroll-area-fixture,
    scroll-panel {
      display: block;
    }
    acceptance-scroll-area-fixture section {
      margin-block: 16px;
    }
    .sa-outer {
      overflow: auto;
      inline-size: 400px;
      block-size: 300px;
    }
    .sa-outer-spacer {
      block-size: 40px;
    }
    .sa-panel {
      inline-size: 300px;
      block-size: 160px;
    }
    .sa-line {
      inline-size: 200px;
      block-size: 60px;
    }
    .sa-short {
      block-size: 16px;
    }
    .sa-wrapper-content {
      block-size: 300px;
    }
    .sa-grow {
      block-size: 100px;
      background: #262626;
    }
    .sa-grow.grown {
      block-size: 1200px;
    }
    .sa-scaler {
      transform-origin: 0 0;
      transform: scale(0.5);
      block-size: 130px;
    }
    .sa-smooth {
      scroll-behavior: smooth;
    }
    .sa-text {
      margin: 0;
      padding: 8px;
      line-height: 24px;
    }
    .sa-control {
      overflow: auto;
      inline-size: 360px;
      block-size: 240px;
    }
    .sa-wide {
      inline-size: 1200px;
      block-size: 40px;
      background: #1f2937;
    }
    .sa-padded {
      padding: 8px 16px;
      border: 2px solid #404040;
    }
    .sa-padded-child {
      inline-size: 300px;
      block-size: 400px;
      background: #1f2937;
    }
    .sa-padded-child.wide {
      inline-size: 1200px;
    }
    .sa-gone {
      display: none;
    }
  `,
  template: `
    <button type="button" data-testid="sa-before">Before</button>

    <section>
      <button type="button" data-testid="table-rows" (click)="rows.set(280)">280 rows</button>
      <button type="button" data-testid="table-few" (click)="rows.set(3)">3 rows</button>
      <button type="button" data-testid="table-min" (click)="bigMin.set(!bigMin())">
        Toggle the 36 px minimum
      </button>
      <button type="button" data-testid="table-narrow" (click)="narrow.set(!narrow())">
        Toggle the narrow width
      </button>
      <output data-testid="table-state"
        >{{ table.state.overflowX() }} {{ table.state.overflowY() }}
        {{ table.state.active() }}</output
      >
      <div class="sa-outer" tabindex="-1" data-testid="outer">
        <div class="sa-outer-spacer"></div>
        <div
          ogScrollArea
          #table="ogScrollArea"
          class="sa"
          data-testid="table"
          [class.big-min]="bigMin()"
          [style.inline-size]="narrow() ? '240px' : null"
        >
          <div
            ogScrollAreaViewport
            class="sa-viewport"
            role="region"
            aria-label="Addresses"
            data-testid="table-viewport"
          >
            <div ogScrollAreaContent scrollAreaStateProbe data-testid="table-content">
              <table>
                <tbody>
                  @for (row of rowIndexes(); track row) {
                    <tr>
                      @for (column of columns; track column) {
                        <td>cell {{ row }}:{{ column }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div ogScrollAreaScrollbar orientation="vertical" class="sa-bar" data-testid="table-vbar">
            <div ogScrollAreaThumb class="sa-thumb" data-testid="table-vthumb"></div>
          </div>
          <div
            ogScrollAreaScrollbar
            orientation="horizontal"
            class="sa-bar"
            data-testid="table-hbar"
          >
            <div ogScrollAreaThumb class="sa-thumb" data-testid="table-hthumb"></div>
          </div>
        </div>
        <div class="sa-outer-spacer"></div>
      </div>
    </section>

    <section>
      <div ogScrollArea class="sa sa-panel" data-testid="panel">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="panel-viewport">
          <div ogScrollAreaContent data-testid="panel-content">
            @for (line of panelLines; track line) {
              <p class="sa-text">
                Line {{ line }}: a sentence long enough to wrap inside the panel instead of
                overflowing it sideways.
              </p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="panel-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="panel-vthumb"></div>
        </div>
      </div>
    </section>

    <section>
      @for (line of cartLines; track line) {
        <div ogScrollArea class="sa sa-line" [attr.data-testid]="'line-' + line">
          <div
            ogScrollAreaViewport
            class="sa-viewport"
            [attr.data-testid]="'line-' + line + '-viewport'"
          >
            <div ogScrollAreaContent>
              @for (item of lineItems; track item) {
                <p class="sa-text">Item {{ line }}.{{ item }}</p>
              }
            </div>
          </div>
          <div ogScrollAreaScrollbar class="sa-bar" [attr.data-testid]="'line-' + line + '-vbar'">
            <div ogScrollAreaThumb class="sa-thumb"></div>
          </div>
        </div>
      }
    </section>

    <section dir="rtl">
      <div ogScrollArea class="sa" data-testid="rtl">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="rtl-viewport">
          <div ogScrollAreaContent>
            <table>
              <tbody>
                @for (row of rtlRows; track row) {
                  <tr>
                    @for (column of columns; track column) {
                      <td>خلية {{ row }}:{{ column }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <div ogScrollAreaScrollbar orientation="vertical" class="sa-bar" data-testid="rtl-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="rtl-vthumb"></div>
        </div>
        <div ogScrollAreaScrollbar orientation="horizontal" class="sa-bar" data-testid="rtl-hbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="rtl-hthumb"></div>
        </div>
      </div>
    </section>

    <section>
      <div ogScrollArea class="sa" data-testid="rtlport">
        <div ogScrollAreaViewport dir="rtl" class="sa-viewport" data-testid="rtlport-viewport">
          <div ogScrollAreaContent>
            <table>
              <tbody>
                @for (row of rtlRows; track row) {
                  <tr>
                    @for (column of columns; track column) {
                      <td>خلية {{ row }}:{{ column }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <div ogScrollAreaScrollbar orientation="vertical" class="sa-bar" data-testid="rtlport-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="rtlport-vthumb"></div>
        </div>
        <div
          ogScrollAreaScrollbar
          orientation="horizontal"
          class="sa-bar"
          data-testid="rtlport-hbar"
        >
          <div ogScrollAreaThumb class="sa-thumb" data-testid="rtlport-hthumb"></div>
        </div>
      </div>
    </section>

    <section>
      <button type="button" data-testid="padded-wide" (click)="paddedWide.set(!paddedWide())">
        Toggle the padded content's width
      </button>
      <div ogScrollArea class="sa" data-testid="padded">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="padded-viewport">
          <div ogScrollAreaContent class="sa-padded" data-testid="padded-content">
            <div
              class="sa-padded-child"
              [class.wide]="paddedWide()"
              data-testid="padded-child"
            ></div>
          </div>
        </div>
        <div ogScrollAreaScrollbar orientation="vertical" class="sa-bar" data-testid="padded-vbar">
          <div ogScrollAreaThumb class="sa-thumb"></div>
        </div>
        <div
          ogScrollAreaScrollbar
          orientation="horizontal"
          class="sa-bar"
          data-testid="padded-hbar"
        >
          <div ogScrollAreaThumb class="sa-thumb" data-testid="padded-hthumb"></div>
        </div>
      </div>
    </section>

    <section>
      <button type="button" data-testid="hiding-thumb" (click)="thumbHidden.set(!thumbHidden())">
        Toggle the thumb's display
      </button>
      <div ogScrollArea class="sa sa-panel" data-testid="hiding">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="hiding-viewport">
          <div ogScrollAreaContent>
            @for (line of panelLines; track line) {
              <p class="sa-text">Hiding {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="hiding-vbar">
          <div
            ogScrollAreaThumb
            class="sa-thumb"
            [class.sa-gone]="thumbHidden()"
            data-testid="hiding-vthumb"
          ></div>
        </div>
      </div>
    </section>

    <section>
      <button type="button" data-testid="wrapper-grow" (click)="grown.set(true)">
        Grow inside the wrapper
      </button>
      <div ogScrollArea class="sa sa-panel" data-testid="wrapper">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="wrapper-viewport">
          <div ogScrollAreaContent class="sa-wrapper-content" data-testid="wrapper-content">
            <div class="sa-grow" [class.grown]="grown()"></div>
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="wrapper-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="wrapper-vthumb"></div>
        </div>
      </div>
    </section>

    <section>
      <div ogScrollArea class="sa sa-panel" data-testid="nested-outer">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="nested-outer-viewport">
          <div ogScrollAreaContent scrollAreaStateProbe data-testid="nested-outer-content">
            <p class="sa-text">Outer start</p>
            <div ogScrollArea class="sa sa-line" data-testid="nested-inner">
              <div ogScrollAreaViewport class="sa-viewport" data-testid="nested-inner-viewport">
                <div ogScrollAreaContent scrollAreaStateProbe data-testid="nested-inner-content">
                  @for (item of lineItems; track item) {
                    <p class="sa-text">Inner {{ item }}</p>
                  }
                </div>
              </div>
              <div ogScrollAreaScrollbar class="sa-bar" data-testid="nested-inner-vbar">
                <div ogScrollAreaThumb class="sa-thumb"></div>
              </div>
            </div>
            @for (line of panelLines; track line) {
              <p class="sa-text">Outer {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="nested-outer-vbar">
          <div ogScrollAreaThumb class="sa-thumb"></div>
        </div>
      </div>
    </section>

    <section>
      <scroll-panel name="composed" hideDelay="300" data-testid="composed">
        @for (line of panelLines; track line) {
          <p class="sa-text">Composed {{ line }}</p>
        }
      </scroll-panel>

      <div ogScrollArea class="sa sa-panel" data-testid="railed">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="railed-viewport">
          <div ogScrollAreaContent data-testid="railed-content">
            @for (line of panelLines; track line) {
              <p class="sa-text">Railed {{ line }}: a line that stays on one line and overflows.</p>
            }
          </div>
        </div>
        <scroll-rails />
      </div>

      <div scrollAreaSettings #settings="scrollAreaSettings">
        <button type="button" data-testid="factory-delay" (click)="settings.hideDelay.set(400)">
          Factory delay 400
        </button>
        <div factoryScrollArea decoyHideDelay="5000" class="sa" data-testid="factory">
          <div ogScrollAreaViewport class="sa-viewport" data-testid="factory-viewport">
            <div ogScrollAreaContent scrollAreaStateProbe data-testid="factory-content">
              <div class="sa-wide"></div>
            </div>
          </div>
          <div
            factoryScrollbar
            decoyOrientation="vertical"
            class="sa-bar"
            data-testid="factory-hbar"
          >
            <div ogScrollAreaThumb class="sa-thumb"></div>
          </div>
        </div>
      </div>

      <div existingScrollArea decoyHideDelay="5000" class="sa sa-panel" data-testid="existing">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="existing-viewport">
          <div ogScrollAreaContent scrollAreaStateProbe data-testid="existing-content">
            @for (line of panelLines; track line) {
              <p class="sa-text">Existing {{ line }}</p>
            }
          </div>
        </div>
        <div
          existingScrollbar
          decoyOrientation="horizontal"
          class="sa-bar"
          data-testid="existing-vbar"
        >
          <div ogScrollAreaThumb class="sa-thumb"></div>
        </div>
      </div>
    </section>

    <section>
      <div ogScrollArea class="sa sa-panel" data-testid="smooth">
        <div ogScrollAreaViewport class="sa-viewport sa-smooth" data-testid="smooth-viewport">
          <div ogScrollAreaContent>
            @for (line of panelLines; track line) {
              <p class="sa-text">Smooth {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="smooth-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="smooth-vthumb"></div>
        </div>
      </div>
    </section>

    <section>
      <button type="button" data-testid="toggles-bar" (click)="barMounted.set(!barMounted())">
        Toggle the Scrollbar
      </button>
      <button type="button" data-testid="toggles-thumb" (click)="thumbMounted.set(!thumbMounted())">
        Toggle the Thumb
      </button>
      <button type="button" data-testid="toggles-viewport" (click)="viewportB.set(!viewportB())">
        Swap the Viewport
      </button>
      <button type="button" data-testid="toggles-root" (click)="rootMounted.set(!rootMounted())">
        Toggle the root
      </button>
      @if (rootMounted()) {
        <div ogScrollArea class="sa sa-panel" data-testid="toggles">
          @if (viewportB()) {
            <div ogScrollAreaViewport class="sa-viewport" data-testid="toggles-viewport-b">
              <div ogScrollAreaContent>
                @for (line of manyLines; track line) {
                  <p class="sa-text">B {{ line }}</p>
                }
              </div>
            </div>
          } @else {
            <div ogScrollAreaViewport class="sa-viewport" data-testid="toggles-viewport-a">
              <div ogScrollAreaContent>
                @for (line of panelLines; track line) {
                  <p class="sa-text">A {{ line }}</p>
                }
              </div>
            </div>
          }
          @if (barMounted()) {
            <div ogScrollAreaScrollbar class="sa-bar" data-testid="toggles-vbar">
              @if (thumbMounted()) {
                <div ogScrollAreaThumb class="sa-thumb" data-testid="toggles-vthumb"></div>
              }
            </div>
          }
        </div>
      }
    </section>

    <section>
      <div ogScrollArea class="sa sa-short" data-testid="short">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="short-viewport">
          <div ogScrollAreaContent>
            @for (line of lineItems; track line) {
              <p class="sa-text">Short {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="short-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="short-vthumb"></div>
        </div>
      </div>
      <p class="sa-text" data-testid="short-after">Just past the short track</p>
    </section>

    <section>
      <div class="sa-scaler">
        <div ogScrollArea class="sa" data-testid="scaled">
          <div ogScrollAreaViewport class="sa-viewport" data-testid="scaled-viewport">
            <div ogScrollAreaContent>
              <table>
                <tbody>
                  @for (row of rtlRows; track row) {
                    <tr>
                      @for (column of columns; track column) {
                        <td>scaled {{ row }}:{{ column }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div
            ogScrollAreaScrollbar
            orientation="vertical"
            class="sa-bar"
            data-testid="scaled-vbar"
          >
            <div ogScrollAreaThumb class="sa-thumb" data-testid="scaled-vthumb"></div>
          </div>
          <div
            ogScrollAreaScrollbar
            orientation="horizontal"
            class="sa-bar"
            data-testid="scaled-hbar"
          >
            <div ogScrollAreaThumb class="sa-thumb" data-testid="scaled-hthumb"></div>
          </div>
        </div>
      </div>
      <div class="sa-scaler" dir="rtl">
        <div ogScrollArea class="sa" data-testid="scaled-rtl">
          <div ogScrollAreaViewport class="sa-viewport" data-testid="scaled-rtl-viewport">
            <div ogScrollAreaContent>
              <table>
                <tbody>
                  @for (row of rtlRows; track row) {
                    <tr>
                      @for (column of columns; track column) {
                        <td>scaled {{ row }}:{{ column }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div
            ogScrollAreaScrollbar
            orientation="vertical"
            class="sa-bar"
            data-testid="scaled-rtl-vbar"
          >
            <div ogScrollAreaThumb class="sa-thumb" data-testid="scaled-rtl-vthumb"></div>
          </div>
          <div
            ogScrollAreaScrollbar
            orientation="horizontal"
            class="sa-bar"
            data-testid="scaled-rtl-hbar"
          >
            <div ogScrollAreaThumb class="sa-thumb" data-testid="scaled-rtl-hthumb"></div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div ogScrollArea class="sa" data-testid="focus">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="focus-viewport">
          <div ogScrollAreaContent>
            @for (line of panelLines; track line) {
              <p class="sa-text">Focus {{ line }}: selectable text in the scroll area.</p>
            }
            <input data-testid="focus-input" aria-label="Offscreen" />
            @for (line of panelLines; track line) {
              <p class="sa-text">After {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="focus-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="focus-vthumb"></div>
        </div>
      </div>
      <div class="sa-control" data-testid="control">
        @for (line of panelLines; track line) {
          <p class="sa-text">Focus {{ line }}: selectable text in the scroll area.</p>
        }
        <input data-testid="control-input" aria-label="Control offscreen" />
        @for (line of panelLines; track line) {
          <p class="sa-text">After {{ line }}</p>
        }
      </div>
      <div ogScrollArea class="sa sa-line" data-testid="untabbable">
        <div
          ogScrollAreaViewport
          tabindex="-1"
          class="sa-viewport"
          data-testid="untabbable-viewport"
        >
          <div ogScrollAreaContent>
            @for (item of lineItems; track item) {
              <p class="sa-text">Untabbable {{ item }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar">
          <div ogScrollAreaThumb class="sa-thumb"></div>
        </div>
      </div>
    </section>

    <button type="button" data-testid="sa-after">After</button>
  `,
})
export class ScrollAreaFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly rows = signal(60);
  readonly bigMin = signal(false);
  readonly narrow = signal(false);
  readonly grown = signal(false);
  readonly paddedWide = signal(false);
  readonly thumbHidden = signal(false);
  readonly barMounted = signal(true);
  readonly thumbMounted = signal(true);
  readonly viewportB = signal(false);
  readonly rootMounted = signal(true);
  readonly columns = columns;
  readonly panelLines = range(12);
  readonly manyLines = range(40);
  readonly lineItems = range(6);
  readonly cartLines = range(3);
  readonly rtlRows = range(30);

  protected rowIndexes(): number[] {
    return range(this.rows());
  }
}

/** The eager page: the fixture, with an attach button that only records the click. */
@Component({
  selector: "acceptance-scroll-area-page",
  imports: [ScrollAreaFixture],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach scroll area behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <acceptance-scroll-area-fixture />
  `,
})
export class ScrollAreaPage {
  readonly attached = signal(false);
}
