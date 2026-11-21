import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, ViewEncapsulation, inject, signal } from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";
import { scrollAreaRecipe } from "./scroll-area.js";

const lines: number[] = [];

for (let line = 0; line < 30; line++) {
  lines.push(line);
}

// SA12: split hydrate boundaries inside a hydrated root. `bar`: the vertical Scrollbar in its own
// `@defer (hydrate when …)` block. `port`: the Viewport in its own block, the root, tracks and
// thumbs outside it. Without incremental hydration the server renders the blocks' placeholders
// and the browser renders them on idle.
@Component({
  selector: "acceptance-scroll-area-split-fixture",
  encapsulation: ViewEncapsulation.None,
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
  ],
  host: { "[attr.data-client-rendered]": "clientRendered" },
  styles: `
    ${scrollAreaRecipe}

    acceptance-scroll-area-split-fixture .sa {
      inline-size: 300px;
      block-size: 160px;
      margin-block: 16px;
    }
    acceptance-scroll-area-split-fixture .sa-text {
      margin: 0;
      padding: 8px;
      line-height: 24px;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach split scroll area behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="hydrate-bar" (click)="barHydrated.set(true)">
      Hydrate the Scrollbar
    </button>
    <button type="button" data-testid="hydrate-port" (click)="portHydrated.set(true)">
      Hydrate the Viewport
    </button>

    <div ogScrollArea class="sa" data-testid="bar">
      <div ogScrollAreaViewport class="sa-viewport" data-testid="bar-viewport">
        <div ogScrollAreaContent>
          @for (line of lines; track line) {
            <p class="sa-text">Bar {{ line }}</p>
          }
        </div>
      </div>
      @defer (hydrate when barHydrated()) {
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="bar-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="bar-vthumb"></div>
        </div>
      } @placeholder {
        <span></span>
      }
    </div>

    <div ogScrollArea class="sa" data-testid="port">
      @defer (hydrate when portHydrated()) {
        <div ogScrollAreaViewport class="sa-viewport" data-testid="port-viewport">
          <div ogScrollAreaContent>
            @for (line of lines; track line) {
              <p class="sa-text">Port {{ line }}</p>
            }
          </div>
        </div>
      } @placeholder {
        <span></span>
      }
      <div ogScrollAreaScrollbar class="sa-bar" data-testid="port-vbar">
        <div ogScrollAreaThumb class="sa-thumb" data-testid="port-vthumb"></div>
      </div>
    </div>
  `,
})
export class ScrollAreaSplitFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);
  readonly barHydrated = signal(false);
  readonly portHydrated = signal(false);
  readonly lines = lines;
}
