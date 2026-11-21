import { Component, ViewEncapsulation, signal } from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";
import { scrollAreaRecipe } from "./scroll-area.js";
import {
  ScrollAreaAxis,
  ScrollAreaAxisPlain,
  ScrollAreaOverride,
  ScrollAreaTwoAxis,
} from "./scroll-area-hydration-parts.js";
import { ScrollAreaText } from "./scroll-area-hydration-text.js";

// SA19: what hydration keeps between its creation pass, which rewrites a retained element's `style`
// to its static styles, and its update pass, which applies the bindings. Two-axis areas of wrappable
// text with the consumer's own static `style` on the Content or the Viewport, and the documented
// path (classes) as the control, hydrated eagerly (outside any block) and in `hydrate on
// interaction` blocks; a vertical-only area whose content overflows sideways, its plain
// `overflow-x: hidden` control and a two-axis area whose template overrides `overflow-x` to
// `hidden`, each in its own `hydrate on interaction` block. The blocks' areas are lazily loaded
// (`scroll-area-hydration-parts.ts`); the hover block loads them first.
@Component({
  selector: "acceptance-scroll-area-hydration-fixture",
  encapsulation: ViewEncapsulation.None,
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
    ScrollAreaText,
    ScrollAreaAxis,
    ScrollAreaAxisPlain,
    ScrollAreaOverride,
    ScrollAreaTwoAxis,
  ],
  styles: `
    ${scrollAreaRecipe}

    acceptance-scroll-area-hydration-fixture .sa {
      inline-size: 300px;
      block-size: 160px;
      margin-block: 16px;
    }
    acceptance-scroll-area-hydration-fixture .sa-text {
      margin: 0;
      padding: 8px;
      line-height: 24px;
    }
    acceptance-scroll-area-hydration-fixture .sa-nowrap {
      white-space: nowrap;
    }
    acceptance-scroll-area-hydration-fixture .sa-inherit {
      color: inherit;
    }
    acceptance-scroll-area-hydration-fixture
      :is(scroll-area-axis, scroll-area-axis-plain, scroll-area-override, scroll-area-two-axis) {
      display: block;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach hydration fixture
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <div ogScrollArea class="sa" data-testid="eager-classed">
      <div ogScrollAreaViewport class="sa-viewport sa-inherit" data-testid="eager-classed-viewport">
        <div ogScrollAreaContent class="sa-inherit" data-testid="eager-classed-content">
          <scroll-area-text name="eager-classed" />
        </div>
      </div>
      <div ogScrollAreaScrollbar class="sa-bar" data-testid="eager-classed-vbar">
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
      <div
        ogScrollAreaScrollbar
        orientation="horizontal"
        class="sa-bar"
        data-testid="eager-classed-hbar"
      >
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
    </div>

    <div ogScrollArea class="sa" data-testid="eager-content">
      <div ogScrollAreaViewport class="sa-viewport" data-testid="eager-content-viewport">
        <div ogScrollAreaContent style="color: inherit" data-testid="eager-content-content">
          <scroll-area-text name="eager-content" />
        </div>
      </div>
      <div ogScrollAreaScrollbar class="sa-bar" data-testid="eager-content-vbar">
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
      <div
        ogScrollAreaScrollbar
        orientation="horizontal"
        class="sa-bar"
        data-testid="eager-content-hbar"
      >
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
    </div>

    <div ogScrollArea class="sa" data-testid="eager-viewport">
      <div
        ogScrollAreaViewport
        class="sa-viewport"
        style="color: inherit"
        data-testid="eager-viewport-viewport"
      >
        <div ogScrollAreaContent data-testid="eager-viewport-content">
          <scroll-area-text name="eager-viewport" />
        </div>
      </div>
      <div ogScrollAreaScrollbar class="sa-bar" data-testid="eager-viewport-vbar">
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
      <div
        ogScrollAreaScrollbar
        orientation="horizontal"
        class="sa-bar"
        data-testid="eager-viewport-hbar"
      >
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
    </div>

    @defer (hydrate on hover) {
      <scroll-area-two-axis name="hover" />
    } @placeholder {
      <p>Hover area</p>
    }

    <button type="button" data-testid="axis-before">Before the deferred areas</button>

    @defer (hydrate on interaction) {
      <scroll-area-axis name="axis" />
    } @placeholder {
      <p>Axis area</p>
    }

    @defer (hydrate on interaction) {
      <scroll-area-axis-plain name="axis-plain" />
    } @placeholder {
      <p>Plain axis area</p>
    }

    @defer (hydrate on interaction) {
      <scroll-area-override name="override" />
    } @placeholder {
      <p>Override area</p>
    }

    @defer (hydrate on interaction) {
      <scroll-area-two-axis name="classed" />
    } @placeholder {
      <p>Classed area</p>
    }

    @defer (hydrate on interaction) {
      <scroll-area-two-axis name="content" styled="content" />
    } @placeholder {
      <p>Content-styled area</p>
    }

    @defer (hydrate on interaction) {
      <scroll-area-two-axis name="viewport" styled="viewport" />
    } @placeholder {
      <p>Viewport-styled area</p>
    }
  `,
})
export class ScrollAreaHydrationFixture {
  readonly attached = signal(false);
}
