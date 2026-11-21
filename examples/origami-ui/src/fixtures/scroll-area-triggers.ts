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

// SA18: roots authored directly as the block roots of `@defer (hydrate on hover)` and
// `@defer (hydrate on interaction)`, so Angular annotates them with its trigger `jsaction`, and a
// plain native scroller of the same size, focus and overflow in its own `hydrate on interaction`
// block as the control for the hydrating key. Each block's content reports, from a child component,
// that it rendered in the browser.
@Component({
  selector: "scroll-area-rendered",
  host: { "[attr.data-client-rendered]": "clientRendered" },
  template: ``,
})
export class ScrollAreaRendered {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
}

@Component({
  selector: "acceptance-scroll-area-triggers-fixture",
  encapsulation: ViewEncapsulation.None,
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
    ScrollAreaRendered,
  ],
  styles: `
    ${scrollAreaRecipe}

    acceptance-scroll-area-triggers-fixture .sa {
      inline-size: 300px;
      block-size: 160px;
      margin-block: 16px;
    }
    acceptance-scroll-area-triggers-fixture .sa-text {
      margin: 0;
      padding: 8px;
      line-height: 24px;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach trigger fixture
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="triggers-before">Before</button>

    @defer (hydrate on hover) {
      <div ogScrollArea class="sa" data-testid="hover">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="hover-viewport">
          <div ogScrollAreaContent>
            <scroll-area-rendered data-testid="hover-rendered" />
            @for (line of lines; track line) {
              <p class="sa-text">Hover {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="hover-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="hover-vthumb"></div>
        </div>
      </div>
    } @placeholder {
      <p>Hover area</p>
    }

    @defer (hydrate on interaction) {
      <div ogScrollArea class="sa" data-testid="interaction">
        <div ogScrollAreaViewport class="sa-viewport" data-testid="interaction-viewport">
          <div ogScrollAreaContent>
            <scroll-area-rendered data-testid="interaction-rendered" />
            @for (line of lines; track line) {
              <p class="sa-text">Interaction {{ line }}</p>
            }
          </div>
        </div>
        <div ogScrollAreaScrollbar class="sa-bar" data-testid="interaction-vbar">
          <div ogScrollAreaThumb class="sa-thumb" data-testid="interaction-vthumb"></div>
        </div>
      </div>
    } @placeholder {
      <p>Interaction area</p>
    }

    @defer (hydrate on interaction) {
      <div class="sa" data-testid="plain">
        <div
          class="sa-viewport"
          tabindex="0"
          style="overflow-x: hidden; overflow-y: auto; scrollbar-width: none"
          data-testid="plain-viewport"
        >
          <div>
            <scroll-area-rendered data-testid="plain-rendered" />
            @for (line of lines; track line) {
              <p class="sa-text">Plain {{ line }}</p>
            }
          </div>
        </div>
      </div>
    } @placeholder {
      <p>Plain area</p>
    }
  `,
})
export class ScrollAreaTriggersFixture {
  readonly attached = signal(false);
  readonly lines = lines;
}
